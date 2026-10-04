import 'server-only'
import { randomBytes, randomUUID } from 'node:crypto'
import { and, desc, eq, lt, or, sql } from 'drizzle-orm'
import { getDb, withDbTransaction } from '@/db/client'
import { appUser, auditLog, place, placeClaim, userPlaceRole, venueLead, venueLeadRate } from '@/db/schema'
import { canChangeLead, canLinkLead, leadDedupe, privateHash, validateLead, type LeadInput, type LeadStatus } from './policy'

async function audit(actorId: string | null, id: string, action: string, before: unknown, after: unknown) {
  await getDb().insert(auditLog).values({ actorUserId: actorId, actorLabel: actorId ? 'venue intake' : 'public intake', action, entity: 'venue_lead', entityId: id, before, after })
}

/** Fail closed, shared across restarts. Quotas are global + IP + phone, not just a client timer. */
export async function consumeLeadQuota(secret: string, ip: string, phone: string, now = new Date()): Promise<boolean> {
  // Autocommit cleanup releases range locks before quota inserts (no gap-lock cycle).
  await getDb().delete(venueLeadRate).where(lt(venueLeadRate.windowStart, new Date(now.getTime() - 86400000)))
  return withDbTransaction(async () => {
    const db = getDb(), start = new Date(Math.floor(now.getTime() / 3600000) * 3600000)
    let allowed = true
    for (const [name, limit] of [['global', 120], [`ip:${ip || 'unknown'}`, 8], [`phone:${phone}`, 3]] as const) {
      const key = privateHash(secret, `${start.toISOString()}:${name}`)
      await db.insert(venueLeadRate).values({ key, windowStart: start, requests: 1 }).onDuplicateKeyUpdate({ set: { requests: sql`${venueLeadRate.requests} + 1` } })
      const [bucket] = await db.select().from(venueLeadRate).where(eq(venueLeadRate.key, key)).for('update')
      if (!bucket || bucket.requests > limit) allowed = false
    }
    return allowed
  })
}

export async function createVenueLead(input: LeadInput, secret: string): Promise<{ trackingCode?: string; duplicate: boolean }> {
  const { data, errors } = validateLead(input)
  if (Object.keys(errors).length) throw new Error('اطلاعات درخواست معتبر نیست.')
  return withDbTransaction(async () => {
    const db = getDb(), requestHash = privateHash(secret, data.requestKey), dedupeKey = leadDedupe(secret, data)
    const id = randomUUID(), trackingCode = randomBytes(12).toString('hex').toUpperCase()
    const [insert] = await db.insert(venueLead).values({ id, trackingCode, requestHash, dedupeKey, contactName: data.contactName, contactPhone: data.contactPhone, cafeName: data.cafeName, city: data.city, branch: data.branch, source: data.source, consentAt: new Date() }).onDuplicateKeyUpdate({ set: { id: sql`${venueLead.id}` } })
    // Only the holder of this high-entropy form key may receive its existing receipt.
    const [row] = await db.select({ id: venueLead.id, trackingCode: venueLead.trackingCode, requestHash: venueLead.requestHash, dedupeKey: venueLead.dedupeKey }).from(venueLead).where(or(eq(venueLead.requestHash, requestHash), eq(venueLead.dedupeKey, dedupeKey))).limit(1)
    if (!row) throw new Error('درخواست ذخیره نشد.')
    if (row.id === id) await audit(null, id, 'lead.created', null, { status: 'new', source: data.source })
    void insert
    return { duplicate: row.id !== id, trackingCode: row.requestHash === requestHash && row.dedupeKey === dedupeKey ? row.trackingCode : undefined }
  })
}

export async function listVenueLeads(status?: LeadStatus, offset = 0) {
  return getDb().select().from(venueLead).where(status ? eq(venueLead.status, status) : undefined).orderBy(desc(venueLead.createdAt)).limit(40).offset(offset)
}
export async function listMyVenueLeads(userId: string) {
  const [account] = await getDb().select().from(appUser).where(eq(appUser.id, userId))
  if (!account?.phone || !account.phoneVerifiedAt || account.status !== 'active') return []
  return getDb().select({ id: venueLead.id, trackingCode: venueLead.trackingCode, cafeName: venueLead.cafeName, city: venueLead.city, branch: venueLead.branch, status: venueLead.status, placeId: venueLead.placeId, claimId: venueLead.claimId, createdAt: venueLead.createdAt }).from(venueLead).where(and(eq(venueLead.contactPhone, account.phone), or(sql`${venueLead.userId} IS NULL`, eq(venueLead.userId, userId)))).orderBy(desc(venueLead.createdAt)).limit(40)
}

/** Verified phone binds the request; it does NOT grant a role. */
export async function submitVenueClaim(userId: string, leadId: string, placeId: number): Promise<void> {
  await withDbTransaction(async () => {
    const db = getDb()
    const [lead] = await db.select().from(venueLead).where(eq(venueLead.id, leadId)).for('update')
    const [account] = await db.select().from(appUser).where(eq(appUser.id, userId)).for('update')
    if (!lead || !account || account.mustChangePassword || !canLinkLead(account, lead)) throw new Error('این درخواست به شمارهٔ تأییدشدهٔ حساب فعال شما تعلق ندارد یا تغییر رمز لازم است.')
    if (lead.claimId) { if (lead.placeId === placeId && lead.userId === userId) return; throw new Error('شعبهٔ این درخواست قبلاً برای بررسی انتخاب شده است؛ با پشتیبانی تماس بگیرید.') }
    if (['active', 'rejected', 'closed'].includes(lead.status)) throw new Error('این درخواست در وضعیت بررسی نیست.')
    const [venue] = await db.select({ id: place.id }).from(place).where(and(eq(place.id, placeId), eq(place.status, 'published')))
    if (!venue) throw new Error('شعبهٔ منتشرشده پیدا نشد؛ برای کافهٔ جدید با پشتیبانی هماهنگ کنید.')
    const [claim] = await db.insert(placeClaim).values({ placeId, userId, contactPhone: account.phone, note: `Sales request ${leadId}` })
    await db.update(venueLead).set({ userId, placeId, claimId: claim.insertId, status: 'review', revision: sql`${venueLead.revision}+1` }).where(eq(venueLead.id, leadId))
    await audit(userId, leadId, 'lead.claim_requested', { status: lead.status }, { status: 'review', placeId, claimId: claim.insertId })
  })
}

/** Both authorization and approval checks also live in the repository, not only UI. */
async function adminAccount(actorId: string) {
  const [actor] = await getDb().select().from(appUser).where(eq(appUser.id, actorId))
  if (!actor || actor.role !== 'admin' || actor.status !== 'active' || actor.mustChangePassword) throw new Error('دسترسی مدیریت معتبر نیست.')
}
export async function updateVenueLead(actorId: string, leadId: string, revision: number, patch: { status: LeadStatus; assignedToUserId: string | null; nextFollowUpAt: Date | null; internalNote: string }) {
  await withDbTransaction(async () => {
    await adminAccount(actorId)
    const db = getDb(), [lead] = await db.select().from(venueLead).where(eq(venueLead.id, leadId)).for('update')
    if (!lead || lead.revision !== revision) throw new Error('درخواست تغییر کرده است؛ صفحه را تازه کنید.')
    if (!canChangeLead(lead.status, patch.status)) throw new Error('این تغییر وضعیت مجاز نیست؛ فعال‌سازی فقط از تأیید مالکیت انجام می‌شود.')
    if (patch.assignedToUserId) await adminAccount(patch.assignedToUserId)
    if (lead.claimId && ['rejected', 'closed'].includes(patch.status)) await db.update(placeClaim).set({ status: 'rejected', reviewedByUserId: actorId, reviewedAt: new Date() }).where(and(eq(placeClaim.id, lead.claimId), eq(placeClaim.status, 'pending')))
    const reopening = patch.status === 'new' && ['rejected', 'closed'].includes(lead.status)
    await db.update(venueLead).set({ ...patch, ...(reopening ? { claimId: null, placeId: null } : {}), internalNote: patch.internalNote.slice(0, 2000), revision: revision + 1 }).where(eq(venueLead.id, leadId))
    await audit(actorId, leadId, 'lead.updated', { status: lead.status, assignedToUserId: lead.assignedToUserId }, { status: patch.status, assignedToUserId: patch.assignedToUserId, nextFollowUpAt: patch.nextFollowUpAt?.toISOString() ?? null, noteChanged: patch.internalNote !== lead.internalNote })
  })
}

export async function approveVenueClaim(actorId: string, leadId: string, revision: number, rationale: string) {
  if (rationale.trim().length < 10) throw new Error('روش بررسی مالکیت را حداقل در ۱۰ نویسه ثبت کنید.')
  await withDbTransaction(async () => {
    await adminAccount(actorId)
    const db = getDb(), [lead] = await db.select().from(venueLead).where(eq(venueLead.id, leadId)).for('update')
    if (!lead || lead.revision !== revision || lead.status !== 'review' || !lead.userId || !lead.placeId || !lead.claimId) throw new Error('درخواست آمادهٔ تأیید نیست یا تغییر کرده است.')
    const [account] = await db.select().from(appUser).where(eq(appUser.id, lead.userId)).for('update')
    const [claim] = await db.select().from(placeClaim).where(eq(placeClaim.id, lead.claimId)).for('update')
    const [venue] = await db.select().from(place).where(eq(place.id, lead.placeId))
    if (!account || !canLinkLead(account, lead) || account.mustChangePassword || !claim || claim.status !== 'pending' || claim.userId !== account.id || claim.placeId !== lead.placeId || venue?.status !== 'published') throw new Error('حساب، شعبه یا درخواست مالکیت معتبر نیست.')
    await db.insert(userPlaceRole).values({ userId: account.id, placeId: lead.placeId, role: 'owner', status: 'active', grantedByUserId: actorId }).onDuplicateKeyUpdate({ set: { role: 'owner', status: 'active', grantedByUserId: actorId } })
    if (account.role === 'customer') await db.update(appUser).set({ role: 'owner' }).where(eq(appUser.id, account.id))
    await db.update(placeClaim).set({ status: 'approved', reviewedByUserId: actorId, reviewedAt: new Date(), note: rationale.trim().slice(0, 500) }).where(eq(placeClaim.id, claim.id))
    await db.update(venueLead).set({ status: 'active', revision: revision + 1 }).where(eq(venueLead.id, leadId))
    await audit(actorId, leadId, 'lead.panel_activated', { status: 'review' }, { status: 'active', userId: account.id, placeId: lead.placeId, claimId: claim.id })
  })
}
