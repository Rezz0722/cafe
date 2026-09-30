import 'server-only'
import { randomBytes } from 'node:crypto'
import { and, desc, eq, gt, isNull, or, sql } from 'drizzle-orm'
import { getDb, withDbTransaction } from '@/db/client'
import { appUser, clubCode, clubMembership, clubOffer, place } from '@/db/schema'
import { cleanUserText } from '@/core/security/input'
import { parseDiscountExpiry } from './discount'

export async function membershipFor(userId: string, placeId: number) {
  return (await getDb().select({ status: clubMembership.status }).from(clubMembership).where(and(eq(clubMembership.userId,userId),eq(clubMembership.placeId,placeId))).limit(1))[0] ?? null
}
export async function setMembership(userId:string, placeId:number, active:boolean){
  const [target]=await getDb().select({id:place.id}).from(place).where(and(eq(place.id,placeId),eq(place.status,'published'))).limit(1)
  if(!target) throw new Error('این کافه برای عضویت در دسترس نیست.')
  await getDb().insert(clubMembership).values({userId,placeId,status:active?'active':'left',consentAt:new Date()}).onDuplicateKeyUpdate({set:{status:active?'active':'left',...(active?{consentAt:new Date()}:{})}})
}
export async function listClubMembers(placeId:number){return getDb().select({userId:appUser.id,name:appUser.name,phone:appUser.phone,joinedAt:clubMembership.consentAt}).from(clubMembership).innerJoin(appUser,eq(appUser.id,clubMembership.userId)).where(and(eq(clubMembership.placeId,placeId),eq(clubMembership.status,'active'),eq(appUser.status,'active'))).orderBy(desc(clubMembership.consentAt),appUser.id).limit(25)}
export async function listOffers(placeId:number){return getDb().select().from(clubOffer).where(and(eq(clubOffer.placeId,placeId),eq(clubOffer.active,true),or(isNull(clubOffer.expiresAt),gt(clubOffer.expiresAt,new Date())))).orderBy(desc(clubOffer.createdAt))}
export async function createOffer(input:{placeId:number;title:string;description?:string;discountLabel:string;createdBy:string;expiresAt?:string}){const title=cleanUserText(input.title,120),label=cleanUserText(input.discountLabel,80);if(!title||!label)throw new Error('عنوان و مقدار تخفیف لازم است.');await getDb().insert(clubOffer).values({placeId:input.placeId,title,description:cleanUserText(input.description,500)||null,discountLabel:label,expiresAt:input.expiresAt?parseDiscountExpiry(input.expiresAt):null,createdByUserId:input.createdBy})}
export async function issueCode(input: { placeId: number; offerId: number; userId: string }) {
  return withDbTransaction(async () => {
  const db=getDb()
  const now = new Date()
  const [member] = await db
    .select({ id: clubMembership.userId })
    .from(clubMembership).innerJoin(appUser,eq(appUser.id,clubMembership.userId))
    .where(and(
      eq(clubMembership.placeId, input.placeId),
      eq(clubMembership.userId, input.userId),
      eq(clubMembership.status, 'active'),
      eq(appUser.status,'active'),
    ))
    .limit(1)
  const [offer] = await db
    .select({ id: clubOffer.id })
    .from(clubOffer)
    .where(and(
      eq(clubOffer.id, input.offerId),
      eq(clubOffer.placeId, input.placeId),
      eq(clubOffer.active, true),
      or(isNull(clubOffer.expiresAt), gt(clubOffer.expiresAt, now)),
    ))
    .limit(1).for('update')

  if (!member || !offer) throw new Error('عضو یا پیشنهاد معتبر نیست.')

  // برای هر پیشنهاد و کاربر حداکثر یک کد فعال نگه می‌داریم.
  const [existing] = await db
    .select({ code: clubCode.code, status: clubCode.status })
    .from(clubCode)
    .where(and(
      eq(clubCode.offerId, offer.id),
      eq(clubCode.userId, input.userId),
    ))
    .limit(1)
  if (existing?.status === 'issued') return existing.code
  if (existing) throw new Error('این پیشنهاد قبلاً برای عضو صادر یا مصرف شده است.')

  // 48 bits of entropy keeps an issued code impractical to guess while remaining readable.
  const code = `KU-${randomBytes(6).toString('hex').toUpperCase()}`
  await db.insert(clubCode).values({ offerId: offer.id, userId: input.userId, code })
  return code
  })
}

/** ارسال داخل پنل؛ lock روی پیشنهاد، ارسال مجدد/همزمان را idempotent می‌کند. */
export async function broadcastOffer(placeId: number, offerId: number) {
  return withDbTransaction(async () => {
    const db=getDb()
    const [offer] = await db.select({id:clubOffer.id}).from(clubOffer).where(and(eq(clubOffer.id,offerId),eq(clubOffer.placeId,placeId),eq(clubOffer.active,true),or(isNull(clubOffer.expiresAt),gt(clubOffer.expiresAt,new Date())))).limit(1).for('update')
    if (!offer) throw new Error('پیشنهاد فعال متعلق به این کافه پیدا نشد.')
    const members = await db.select({id:clubMembership.userId}).from(clubMembership).innerJoin(appUser,eq(appUser.id,clubMembership.userId)).where(and(eq(clubMembership.placeId,placeId),eq(clubMembership.status,'active'),eq(appUser.status,'active')))
    const existing = await db.select({id:clubCode.userId}).from(clubCode).where(eq(clubCode.offerId,offerId))
    const seen = new Set(existing.map(x=>x.id))
    const pending = members.filter(x=>!seen.has(x.id))
    for (let i=0;i<pending.length;i+=200) await db.insert(clubCode).values(pending.slice(i,i+200).map(m=>({offerId,userId:m.id,code:`KU-${randomBytes(6).toString('hex').toUpperCase()}`})))
    return { sent:pending.length, alreadySent:members.length-pending.length }
  })
}

export async function redeemCode(input: { placeId: number; code: string; actorId: string }) {
  const db = getDb()
  const token = cleanUserText(input.code, 16).toUpperCase()
  const [row] = await db
    .select({ id: clubCode.id })
    .from(clubCode)
    .innerJoin(clubOffer, eq(clubOffer.id, clubCode.offerId))
    .innerJoin(appUser,eq(appUser.id,clubCode.userId))
    .innerJoin(clubMembership,and(eq(clubMembership.userId,clubCode.userId),eq(clubMembership.placeId,clubOffer.placeId)))
    .where(and(
      eq(clubCode.code, token),
      eq(clubCode.status, 'issued'),
      eq(clubOffer.placeId, input.placeId),
      eq(clubOffer.active,true),
      eq(clubMembership.status,'active'),
      eq(appUser.status,'active'),
      or(isNull(clubOffer.expiresAt),gt(clubOffer.expiresAt,new Date())),
    ))
    .limit(1)
  if (!row) return false

  const result = await db
    .update(clubCode)
    .set({ status: 'redeemed', redeemedAt: new Date(), redeemedByUserId: input.actorId })
    .where(and(eq(clubCode.id, row.id), eq(clubCode.status, 'issued'),sql`EXISTS (SELECT 1 FROM club_offer co WHERE co.id=${clubCode.offerId} AND co.place_id=${input.placeId} AND co.active=1 AND (co.expires_at IS NULL OR co.expires_at>CURRENT_TIMESTAMP))`,sql`EXISTS (SELECT 1 FROM club_membership cm JOIN app_user au ON au.id=cm.user_id WHERE cm.user_id=${clubCode.userId} AND cm.place_id=${input.placeId} AND cm.status='active' AND au.status='active')`))
  const affectedRows = (result[0] as unknown as { affectedRows?: number })?.affectedRows ?? 0
  return affectedRows === 1
}
export async function listMyClub(userId:string){return getDb().select({code:clubCode.code,status:sql<string>`CASE WHEN ${clubCode.status}<>'issued' THEN ${clubCode.status} WHEN ${clubOffer.active}=0 OR ${clubMembership.status}<>'active' OR ${clubMembership.status} IS NULL THEN 'cancelled' WHEN ${clubOffer.expiresAt} IS NOT NULL AND ${clubOffer.expiresAt}<=CURRENT_TIMESTAMP THEN 'expired' ELSE 'issued' END`,expiresAt:clubOffer.expiresAt,issuedAt:clubCode.issuedAt,redeemedAt:clubCode.redeemedAt,title:clubOffer.title,discountLabel:clubOffer.discountLabel,placeName:place.name,placeSlug:place.slug}).from(clubCode).innerJoin(clubOffer,eq(clubOffer.id,clubCode.offerId)).innerJoin(place,eq(place.id,clubOffer.placeId)).leftJoin(clubMembership,and(eq(clubMembership.userId,clubCode.userId),eq(clubMembership.placeId,clubOffer.placeId))).where(eq(clubCode.userId,userId)).orderBy(desc(clubCode.issuedAt))}
