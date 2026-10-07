import 'server-only'
import { randomBytes } from 'node:crypto'
import { and, eq, gte, inArray, sql } from 'drizzle-orm'
import { getDb, withDbTransaction } from '@/db/client'
import { appUser, dailyStat, place, userPlaceRole, venueQrLink } from '@/db/schema'
import { recordAudit, type Actor } from '@/core/places/manage'
import { samePlaceRevision } from '@/core/places/revision'
import { qrLabel, validQrToken } from './channelPolicy'

export interface QrChannel { id: number; token: string; label: string; kind: 'table' | 'channel'; active: boolean; opens: number; recentOpens: number }
async function authorize(placeId: number, actor: Actor, locked = false) {
  if (actor.onBehalfOf) throw new Error('در حالت مشاهده به‌عنوان، مدیریت QR مجاز نیست.')
  const accountQuery = getDb().select().from(appUser).where(eq(appUser.id, actor.userId)).limit(1)
  const [account] = await (locked ? accountQuery.for('update') : accountQuery)
  const roleQuery = getDb().select().from(userPlaceRole).where(and(eq(userPlaceRole.userId, actor.userId), eq(userPlaceRole.placeId, placeId))).limit(1)
  const [role] = await (locked ? roleQuery.for('update') : roleQuery)
  if (!account || account.status !== 'active' || account.mustChangePassword || (account.role !== 'admin' && role?.status !== 'active')) throw new Error('به این شعبه دسترسی فعال ندارید.')
}
export async function listQrChannels(placeId: number, actor: Actor): Promise<QrChannel[]> {
  // View-as cannot mutate; route intentionally does not expose these private metrics in that mode.
  await authorize(placeId, actor)
  const rows = await getDb().select().from(venueQrLink).where(eq(venueQrLink.placeId, placeId)).orderBy(venueQrLink.id)
  if (!rows.length) return []
  const firstDay = new Date(new Date().toISOString().slice(0, 10)); firstDay.setUTCDate(firstDay.getUTCDate() - 29)
  const stats = await getDb().select({ refId: dailyStat.refId, opens: sql<number>`SUM(${dailyStat.value})` }).from(dailyStat)
    .where(and(eq(dailyStat.metric, 'qr_opens'), gte(dailyStat.day, firstDay), inArray(dailyStat.refId, rows.map(row => String(row.id)))))
    .groupBy(dailyStat.refId)
  const totals = new Map(stats.map(row => [row.refId, Number(row.opens)]))
  return rows.map(row => ({ id: row.id, token: row.token, label: row.label, kind: row.kind, active: row.active, opens: Number(row.opens), recentOpens: totals.get(String(row.id)) || 0 }))
}
export async function manageQrChannel(input: { placeId: number; revision: string; operation: string; label: string; kind: string; id: number }, actor: Actor) {
  return withDbTransaction(async () => {
    const [venue] = await getDb().select().from(place).where(eq(place.id, input.placeId)).limit(1).for('update')
    if (!venue || !samePlaceRevision(venue.revision, input.revision)) throw new Error('اطلاعات شعبه تغییر کرده؛ صفحه را تازه کنید.')
    await authorize(input.placeId, actor, true)
    let qrId: number
    if (input.operation === 'create') {
      if (!['published', 'temporarily_closed'].includes(venue.status)) throw new Error('ابتدا شعبه باید منتشرشده باشد.')
      if (!['table', 'channel'].includes(input.kind)) throw new Error('نوع QR معتبر نیست.')
      const { label, key } = qrLabel(input.label)
      const existing = await getDb().select({ id: venueQrLink.id, key: venueQrLink.labelKey }).from(venueQrLink).where(eq(venueQrLink.placeId, input.placeId))
      if (existing.some(row => row.key === key)) throw new Error('این نام QR قبلاً ثبت شده؛ همان QR را استفاده یا فعال کنید.')
      if (existing.length >= 50) throw new Error('حداکثر ۵۰ QR برای هر شعبه مجاز است.')
      const [result] = await getDb().insert(venueQrLink).values({ placeId: input.placeId, label, labelKey: key, kind: input.kind as 'table' | 'channel', token: randomBytes(16).toString('hex') })
      qrId = result.insertId
    } else {
      if (!['pause', 'resume'].includes(input.operation)) throw new Error('عملیات QR معتبر نیست.')
      const [qr] = await getDb().select().from(venueQrLink).where(and(eq(venueQrLink.id, input.id), eq(venueQrLink.placeId, input.placeId))).limit(1).for('update')
      if (!qr) throw new Error('QR همین شعبه پیدا نشد.')
      if (qr.active === (input.operation === 'resume')) throw new Error('وضعیت QR قبلاً تغییر کرده؛ صفحه را تازه کنید.')
      qrId = qr.id
      await getDb().update(venueQrLink).set({ active: input.operation === 'resume' }).where(eq(venueQrLink.id, qrId))
    }
    await recordAudit(actor, `qr.${input.operation}`, 'place', input.placeId, null, { qrId })
    await getDb().update(place).set({ revision: sql`${place.revision} + 1`, updatedAt: new Date() }).where(eq(place.id, input.placeId))
    return qrId
  })
}
export async function resolveQrChannel(token: string) {
  if (!validQrToken(token)) return null
  const [row] = await getDb().select({ id: venueQrLink.id, slug: place.slug }).from(venueQrLink).innerJoin(place, eq(place.id, venueQrLink.placeId))
    .where(and(eq(venueQrLink.token, token), eq(venueQrLink.active, true), inArray(place.status, ['published', 'temporarily_closed']))).limit(1)
  return row || null
}
export async function recordQrOpen(id: number, now = new Date()) {
  await withDbTransaction(async () => {
    // Atomic, aggregate only: no IP, UA, user/session ID or raw visitor event persisted.
    const [reference] = await getDb().select({ placeId: venueQrLink.placeId }).from(venueQrLink).where(eq(venueQrLink.id, id)).limit(1)
    if (!reference) return
    // Match management lock order (place before QR) to avoid an inverse-order deadlock.
    const [venue] = await getDb().select({ status: place.status }).from(place).where(eq(place.id, reference.placeId)).limit(1).for('update')
    if (!venue || !['published', 'temporarily_closed'].includes(venue.status)) return
    const [row] = await getDb().select({ active: venueQrLink.active }).from(venueQrLink).where(eq(venueQrLink.id, id)).limit(1).for('update')
    if (!row?.active) return
    await getDb().update(venueQrLink).set({ opens: sql`${venueQrLink.opens} + 1` }).where(eq(venueQrLink.id, id))
    await getDb().insert(dailyStat).values({ day: new Date(now.toISOString().slice(0, 10)), metric: 'qr_opens', refId: String(id), value: 1 })
      .onDuplicateKeyUpdate({ set: { value: sql`${dailyStat.value} + 1` } })
  })
}
