import 'server-only'
import {and, desc, eq, sql} from 'drizzle-orm'
import {getDb, withDbTransaction} from '@/db/client'
import {appUser, clubMembership, clubOffer, clubCode} from '@/db/schema'
import {cleanUserText} from '@/core/security/input'
import {parseDiscountExpiry} from './discount'
import {toAsciiDigits} from '@/core/text/normalize'

export async function getClubManageData(placeId:number, section:'members'|'codes'|'offers', page=1, query='') {
  const db=getDb(), needle=`%${toAsciiDigits(query).replace(/[\\%_]/g,'\\$&')}%`
  if(section==='members') {
    const where=and(eq(clubMembership.placeId,placeId),eq(clubMembership.status,'active'),eq(appUser.status,'active'),sql`(${appUser.name} LIKE ${needle} OR ${appUser.phone} LIKE ${needle})`)
    const [count]=await db.select({total:sql<number>`COUNT(*)`}).from(clubMembership).innerJoin(appUser,eq(appUser.id,clubMembership.userId)).where(where)
    const current=Math.min(page,Math.max(1,Math.ceil(Number(count?.total??0)/25))),offset=(current-1)*25
    const rows=await db.select({userId:appUser.id,name:appUser.name,phone:appUser.phone,joinedAt:clubMembership.consentAt}).from(clubMembership).innerJoin(appUser,eq(appUser.id,clubMembership.userId)).where(where).orderBy(desc(clubMembership.consentAt),appUser.id).limit(25).offset(offset)
    return {rows,total:Number(count?.total??0),page:current}
  }
  if(section==='offers') {
    const where=eq(clubOffer.placeId,placeId)
    const [count]=await db.select({total:sql<number>`COUNT(*)`}).from(clubOffer).where(where)
    const current=Math.min(page,Math.max(1,Math.ceil(Number(count?.total??0)/25))),offset=(current-1)*25
    const rows=await db.select({id:clubOffer.id,title:clubOffer.title,description:clubOffer.description,discountLabel:clubOffer.discountLabel,active:clubOffer.active,expiresAt:clubOffer.expiresAt,issued:sql<number>`(SELECT COUNT(*) FROM club_code cc WHERE cc.offer_id=club_offer.id)`}).from(clubOffer).where(where).orderBy(desc(clubOffer.id)).limit(25).offset(offset)
    return {rows:rows.map(row=>({...row,issued:Number(row.issued??0)})),total:Number(count?.total??0),page:current}
  }
  const where=eq(clubOffer.placeId,placeId)
  const [count]=await db.select({total:sql<number>`COUNT(*)`}).from(clubCode).innerJoin(clubOffer,eq(clubOffer.id,clubCode.offerId)).where(where)
  const current=Math.min(page,Math.max(1,Math.ceil(Number(count?.total??0)/25))),offset=(current-1)*25
  const rows=await db.select({id:clubCode.id,title:clubOffer.title,name:sql<string>`CASE WHEN ${appUser.status}='active' AND ${clubMembership.status}='active' THEN ${appUser.name} ELSE 'عضو غیرفعال' END`,code:sql<string>`CASE WHEN ${clubCode.status}='issued' AND ${clubMembership.status}='active' AND ${appUser.status}='active' THEN ${clubCode.code} ELSE CONCAT('…',RIGHT(${clubCode.code},4)) END`,status:sql<string>`CASE WHEN ${clubCode.status}<>'issued' THEN ${clubCode.status} WHEN ${clubOffer.active}=0 OR COALESCE(${clubMembership.status},'left')<>'active' OR ${appUser.status}<>'active' THEN 'cancelled' WHEN ${clubOffer.expiresAt} IS NOT NULL AND ${clubOffer.expiresAt}<=CURRENT_TIMESTAMP THEN 'expired' ELSE 'issued' END`,issuedAt:clubCode.issuedAt}).from(clubCode).innerJoin(clubOffer,eq(clubOffer.id,clubCode.offerId)).innerJoin(appUser,eq(appUser.id,clubCode.userId)).leftJoin(clubMembership,and(eq(clubMembership.placeId,placeId),eq(clubMembership.userId,appUser.id))).where(where).orderBy(desc(clubCode.id)).limit(25).offset(offset)
  return {rows,total:Number(count?.total??0),page:current}
}

export async function changeClubOffer(placeId:number, offerId:number, operation:string, input:{title:string;description:string;discountLabel:string;expiresAt:string}) {
  return withDbTransaction(async()=>{
    const db=getDb(),[offer]=await db.select().from(clubOffer).where(and(eq(clubOffer.id,offerId),eq(clubOffer.placeId,placeId))).limit(1).for('update')
    if(!offer)throw new Error('پیشنهاد متعلق به این کافه پیدا نشد.')
    if(operation==='cancel') {await db.update(clubOffer).set({active:false}).where(eq(clubOffer.id,offerId));await db.update(clubCode).set({status:'cancelled'}).where(and(eq(clubCode.offerId,offerId),eq(clubCode.status,'issued')));return offer}
    if(operation!=='edit')throw new Error('عملیات معتبر نیست.')
    const [issued]=await db.select({id:clubCode.id}).from(clubCode).where(eq(clubCode.offerId,offerId)).limit(1)
    if(issued)throw new Error('شرایط پیشنهادی که کد دارد قابل تغییر نیست؛ پیشنهاد جدید بسازید و در صورت نیاز قبلی را متوقف کنید.')
    const title=cleanUserText(input.title,120),discountLabel=cleanUserText(input.discountLabel,80)
    if(!title || !discountLabel)throw new Error('عنوان و مقدار تخفیف لازم است.')
    await db.update(clubOffer).set({title,discountLabel,description:cleanUserText(input.description,500)||null,expiresAt:input.expiresAt?parseDiscountExpiry(input.expiresAt):null}).where(eq(clubOffer.id,offerId))
    return offer
  })
}
