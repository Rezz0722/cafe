import 'server-only'

import { randomUUID } from 'node:crypto'
import { and, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { afterDbCommit, getDb, withDbTransaction } from '@/db/client'
import {
  appUser, auditLog, bookingItemIntent, bookingRequest, bookingStatusHistory,
  menuItem, menuItemVariant, menuSection, place, userPlaceRole, venueBookingSettings,
} from '@/db/schema'
import type { Session } from '@/core/auth/currentUser'
import { authorizeVenueSession, type VenueAccess } from '@/core/auth/venueAccess'
import { recordAudit } from '@/core/places/manage'
import { cleanUserText } from '@/core/security/input'
import { canonicalBookingDraft, hashBookingDraft, normalizeBookingDraft, tehranCivilNow, validateBookingWindow,
  type BookingDraft, type BookingWindow } from './policy'
import { assertBookingTransition, isProposedTimePast } from './state'

export interface VenueBookingConfiguration extends BookingWindow {
  enabled: boolean
  instructions: string | null
  revision: number
}

const MAX_REQUESTS_PER_HOUR = 5
const MAX_VENUE_LIST = 100

function requireCustomer(session: Session): string {
  if (!session.user) throw new Error('برای ثبت یا مشاهدهٔ درخواست وارد شوید.')
  if (session.actor) throw new Error('در حالت مشاهده به‌عنوان، اطلاعات خصوصی و عملیات رزرو در دسترس نیست.')
  return session.user.id
}

function isDuplicateKey(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const record = error as { code?: string; cause?: unknown }
  return record.code === 'ER_DUP_ENTRY' || isDuplicateKey(record.cause)
}

function asConfiguration(row: typeof venueBookingSettings.$inferSelect): VenueBookingConfiguration {
  return {
    enabled: row.enabled,
    requestFrom: row.requestFrom,
    requestUntil: row.requestUntil,
    maxPartySize: row.maxPartySize,
    minNoticeMinutes: row.minNoticeMinutes,
    maxAdvanceDays: row.maxAdvanceDays,
    instructions: row.instructions,
    revision: row.revision,
  }
}

/** Re-read and lock the live account/assignment for a status-changing transaction. */
async function requireStableVenueWrite(session: Session, placeId: number): Promise<VenueAccess> {
  const access = await authorizeVenueSession(session, placeId)
  if (!access.ok) throw new Error(access.error)
  const db = getDb()
  const [account] = await db.select({ role: appUser.role, status: appUser.status, mustChangePassword: appUser.mustChangePassword })
    .from(appUser).where(eq(appUser.id, access.actor.userId)).for('update')
  if (!account || account.status !== 'active' || account.mustChangePassword) throw new Error('حساب فعال نیست.')
  if (account.role !== 'admin') {
    const [assignment] = await db.select({ role: userPlaceRole.role, status: userPlaceRole.status })
      .from(userPlaceRole)
      .where(and(eq(userPlaceRole.userId, access.actor.userId), eq(userPlaceRole.placeId, placeId)))
      .for('update')
    if (account.role !== 'owner' || assignment?.status !== 'active' ||
      !['owner', 'manager'].includes(assignment.role)) throw new Error('دسترسی این شعبه معتبر نیست.')
  }
  return access
}

async function activeVenueHandlerExists(placeId: number): Promise<boolean> {
  const [row] = await getDb().select({ id: appUser.id }).from(userPlaceRole)
    .innerJoin(appUser, eq(appUser.id, userPlaceRole.userId))
    .where(and(eq(userPlaceRole.placeId, placeId), eq(userPlaceRole.status, 'active'),
      inArray(userPlaceRole.role, ['owner', 'manager']), eq(appUser.status, 'active'),
      eq(appUser.mustChangePassword, false)))
    .limit(1)
  return Boolean(row)
}

/** Public read contains no contact details and never implies table capacity. */
export async function getPublicBookingConfiguration(placeId: number): Promise<VenueBookingConfiguration | null> {
  if (!Number.isSafeInteger(placeId) || placeId <= 0) return null
  const [row] = await getDb().select({ settings: venueBookingSettings, venue: place })
    .from(venueBookingSettings).innerJoin(place, eq(place.id, venueBookingSettings.placeId))
    .where(eq(venueBookingSettings.placeId, placeId)).limit(1)
  if (!row || !row.settings.enabled || row.venue.status !== 'published' || row.venue.kind === 'shop') return null
  try { validateBookingWindow(row.settings) } catch { return null }
  if (!(await activeVenueHandlerExists(placeId))) return null
  return asConfiguration(row.settings)
}

export async function saveVenueBookingConfiguration(
  session: Session,
  placeId: number,
  expectedRevision: number,
  next: Omit<VenueBookingConfiguration, 'revision'>,
  invalidateCafePage: (slug: string) => void = slug => revalidatePath(`/cafe/${slug}`),
): Promise<VenueBookingConfiguration> {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new Error('نسخهٔ تنظیمات نامعتبر است.')
  if (next.enabled) validateBookingWindow(next)
  const instructions = cleanUserText(next.instructions, 500) || null
  return withDbTransaction(async () => {
    const access = await requireStableVenueWrite(session, placeId)
    const db = getDb()
    const [venue] = await db.select({ id: place.id, slug: place.slug, status: place.status, kind: place.kind })
      .from(place).where(eq(place.id, placeId)).limit(1)
    if (!venue || venue.kind === 'shop' || (next.enabled && venue.status !== 'published')) {
      throw new Error('این شعبه برای دریافت درخواست فعال نیست.')
    }
    const [previous] = await db.select().from(venueBookingSettings)
      .where(eq(venueBookingSettings.placeId, placeId)).for('update')
    if ((previous?.revision ?? 0) !== expectedRevision) throw new Error('تنظیمات تغییر کرده است؛ صفحه را تازه کنید.')
    const patch = {
      enabled: next.enabled,
      requestFrom: next.requestFrom ? `${next.requestFrom.slice(0, 5)}:00` : null,
      requestUntil: next.requestUntil ? `${next.requestUntil.slice(0, 5)}:00` : null,
      maxPartySize: next.maxPartySize,
      minNoticeMinutes: next.minNoticeMinutes,
      maxAdvanceDays: next.maxAdvanceDays,
      instructions,
      revision: expectedRevision + 1,
    }
    if (previous) await db.update(venueBookingSettings).set(patch).where(eq(venueBookingSettings.placeId, placeId))
    else await db.insert(venueBookingSettings).values({ placeId, ...patch })
    await recordAudit(access.actor, 'booking.settings.updated', 'place', placeId,
      { placeId, enabled: previous?.enabled ?? false, revision: expectedRevision },
      { placeId, enabled: next.enabled, revision: expectedRevision + 1 })
    afterDbCommit(() => invalidateCafePage(venue.slug))
    return { ...next, instructions, revision: expectedRevision + 1 }
  })
}

interface ItemSnapshot {
  menuItemId: number
  menuItemVariantId: number | null
  itemName: string
  variantName: string | null
  quantity: number
  unitPriceToman: number | null
  priceUnknown: boolean
  availableAtRequest: true
}

async function snapshotMenuIntents(placeId: number, input: NonNullable<BookingDraft['items']>): Promise<ItemSnapshot[]> {
  if (!input.length) return []
  const db = getDb(), itemIds = [...new Set(input.map(row => row.itemId))]
  const rows = await db.select({ item: menuItem, section: menuSection }).from(menuItem)
    .innerJoin(menuSection, eq(menuSection.id, menuItem.sectionId))
    .where(inArray(menuItem.id, itemIds))
  const byId = new Map(rows.map(row => [row.item.id, row]))
  const variants = await db.select().from(menuItemVariant).where(inArray(menuItemVariant.itemId, itemIds))
  const byVariantId = new Map(variants.map(row => [row.id, row]))
  return input.map(choice => {
    const row = byId.get(choice.itemId), variant = choice.variantId ? byVariantId.get(choice.variantId) : null
    if (!row || row.item.placeId !== placeId || row.section.placeId !== placeId ||
      !['shared', 'branch'].includes(row.section.branchScope) || row.item.archivedAt || !row.item.available) {
      throw new Error('یکی از اقلام انتخاب‌شده در منوی عمومی این شعبه موجود نیست.')
    }
    const hasVariants = variants.some(value => value.itemId === choice.itemId)
    if ((hasVariants && !variant) || (variant && (variant.itemId !== row.item.id || !variant.available))) {
      throw new Error('تنوع انتخاب‌شده معتبر یا موجود نیست.')
    }
    const price = variant ? variant.price : row.item.price
    return {
      menuItemId: row.item.id, menuItemVariantId: variant?.id ?? null,
      itemName: row.item.name, variantName: variant?.label ?? null,
      quantity: choice.quantity, unitPriceToman: price,
      priceUnknown: price === null, availableAtRequest: true as const,
    }
  })
}

export async function createBookingRequest(session: Session, input: BookingDraft, now = new Date()) {
  const userId = requireCustomer(session)
  const canonical = canonicalBookingDraft(input)
  const idempotencyKey = canonical.idempotencyKey
  const requestHash = hashBookingDraft(canonical)
  const existing = async () => (await getDb().select().from(bookingRequest)
    .where(and(eq(bookingRequest.requesterUserId, userId), eq(bookingRequest.idempotencyKey, idempotencyKey))).limit(1))[0]
  try {
    return await withDbTransaction(async () => {
      const db = getDb()
      // Locking this user serializes the hourly rate check across tabs and workers.
      const [account] = await db.select().from(appUser).where(eq(appUser.id, userId)).for('update')
      if (!account || account.status !== 'active' || account.mustChangePassword || !account.phone || !account.phoneVerifiedAt) {
        throw new Error('برای درخواست، حساب فعال با شمارهٔ تأییدشده لازم است.')
      }
      const prior = await existing()
      if (prior) {
        if (prior.requestHash !== requestHash) throw new Error('شناسهٔ ارسال قبلاً برای درخواست دیگری استفاده شده است.')
        return { id: prior.id, status: prior.status, revision: prior.revision, repeated: true }
      }
      const [settings] = await db.select().from(venueBookingSettings)
        .where(eq(venueBookingSettings.placeId, canonical.placeId)).for('update')
      const [venue] = await db.select({ status: place.status, kind: place.kind }).from(place)
        .where(eq(place.id, canonical.placeId)).limit(1)
      if (!settings?.enabled || venue?.status !== 'published' || venue.kind === 'shop' ||
        !(await activeVenueHandlerExists(canonical.placeId))) throw new Error('این شعبه اکنون درخواست رزرو نمی‌پذیرد.')
      const draft = normalizeBookingDraft(canonical, settings, now)
      const [nearDuplicate] = await db.select({ id: bookingRequest.id }).from(bookingRequest)
        .where(and(eq(bookingRequest.requesterUserId, userId), eq(bookingRequest.placeId, canonical.placeId),
          eq(bookingRequest.kind, draft.kind), eq(bookingRequest.requestedDate, draft.requestedDate),
          eq(bookingRequest.requestedLocalTime, `${draft.requestedLocalTime}:00`),
          inArray(bookingRequest.status, ['pending', 'confirmed']),
          gte(bookingRequest.createdAt, new Date(now.getTime() - 600_000))))
        .limit(1)
      if (nearDuplicate) throw new Error('برای همین شعبه و زمان، درخواست دیگری ثبت کرده‌اید؛ وضعیت آن را در حساب خود ببینید.')
      const [rate] = await db.select({ total: sql<number>`COUNT(*)` }).from(bookingRequest)
        .where(and(eq(bookingRequest.requesterUserId, userId), gte(bookingRequest.createdAt, new Date(now.getTime() - 3_600_000))))
      if (Number(rate?.total ?? 0) >= MAX_REQUESTS_PER_HOUR) throw new Error('تعداد درخواست‌های شما در این ساعت به حد مجاز رسیده است.')
      const snapshots = await snapshotMenuIntents(canonical.placeId, draft.items ?? [])
      const id = randomUUID()
      await db.insert(bookingRequest).values({
        id, placeId: canonical.placeId, requesterUserId: userId,
        kind: draft.kind, experienceSlug: draft.experienceSlug,
        requestedDate: draft.requestedDate, requestedLocalTime: `${draft.requestedLocalTime}:00`,
        partySize: draft.partySize, durationMinutes: draft.durationMinutes,
        needsCake: draft.needsCake, needsDecoration: draft.needsDecoration,
        needsPrivateSpace: draft.needsPrivateSpace, customerNote: draft.customerNote,
        contactPhone: account.phone, consentAt: now, idempotencyKey, requestHash, status: 'pending',
      })
      if (snapshots.length) await db.insert(bookingItemIntent).values(snapshots.map(row => ({ ...row, bookingId: id })))
      await db.insert(bookingStatusHistory).values({ bookingId: id, fromStatus: null, toStatus: 'pending', actorUserId: userId })
      await recordAudit({ userId, label: account.name || userId }, 'booking.created', 'booking_request', id,
        null, { placeId: canonical.placeId, kind: draft.kind, status: 'pending', itemCount: snapshots.length })
      return { id, status: 'pending' as const, revision: 0, repeated: false }
    })
  } catch (error) {
    if (!isDuplicateKey(error)) throw error
    const prior = await existing()
    if (!prior) throw error
    // A concurrent identical retry may have committed while our insert waited.
    if (prior.requestHash !== requestHash) throw new Error('شناسهٔ ارسال قبلاً برای درخواست دیگری استفاده شده است.')
    return { id: prior.id, status: prior.status, revision: prior.revision, repeated: true }
  }
}

export async function listMyBookingRequests(session: Session) {
  const userId = requireCustomer(session)
  return getDb().select({ request: bookingRequest, placeName: place.name, placeSlug: place.slug })
    .from(bookingRequest).innerJoin(place, eq(place.id, bookingRequest.placeId))
    .where(eq(bookingRequest.requesterUserId, userId))
    .orderBy(desc(bookingRequest.createdAt)).limit(100)
}

export async function getMyBookingRequest(session: Session, bookingId: string) {
  const userId = requireCustomer(session)
  const [row] = await getDb().select({ request: bookingRequest, placeName: place.name, placeSlug: place.slug })
    .from(bookingRequest).innerJoin(place, eq(place.id, bookingRequest.placeId))
    .where(and(eq(bookingRequest.id, bookingId), eq(bookingRequest.requesterUserId, userId))).limit(1)
  if (!row) return null
  const items = await getDb().select().from(bookingItemIntent).where(eq(bookingItemIntent.bookingId, bookingId))
  return { ...row, items }
}

export async function cancelMyBookingRequest(session: Session, bookingId: string, revision: number) {
  const userId = requireCustomer(session)
  return withDbTransaction(async () => {
    const db = getDb()
    const [account] = await db.select({ id: appUser.id, status: appUser.status }).from(appUser)
      .where(eq(appUser.id, userId)).for('update')
    if (!account || account.status !== 'active') throw new Error('حساب فعال نیست.')
    const [row] = await db.select().from(bookingRequest).where(eq(bookingRequest.id, bookingId)).for('update')
    if (!row || row.requesterUserId !== userId) throw new Error('درخواست پیدا نشد.')
    if (row.status !== 'pending' || row.revision !== revision) throw new Error('وضعیت درخواست تغییر کرده است؛ صفحه را تازه کنید.')
    assertBookingTransition(row.status, 'cancelled', 'customer', row.requestedDate, row.requestedLocalTime)
    await db.update(bookingRequest).set({ status: 'cancelled', revision: revision + 1, cancellationReason: 'لغو توسط درخواست‌دهنده' })
      .where(eq(bookingRequest.id, bookingId))
    await db.insert(bookingStatusHistory).values({ bookingId, fromStatus: 'pending', toStatus: 'cancelled', actorUserId: userId })
    await recordAudit({ userId, label: userId }, 'booking.cancelled', 'booking_request', bookingId,
      { placeId: row.placeId, status: 'pending' }, { placeId: row.placeId, status: 'cancelled' })
    return { status: 'cancelled' as const, revision: revision + 1 }
  })
}

export async function listVenueBookingRequests(session: Session, placeId: number, status?: typeof bookingRequest.$inferSelect.status) {
  const access = await authorizeVenueSession(session, placeId)
  if (!access.ok) throw new Error(access.error)
  const predicate = status ? and(eq(bookingRequest.placeId, placeId), eq(bookingRequest.status, status)) : eq(bookingRequest.placeId, placeId)
  return getDb().select().from(bookingRequest).where(predicate)
    .orderBy(desc(bookingRequest.createdAt)).limit(MAX_VENUE_LIST)
}

export async function respondToBookingRequest(
  session: Session, placeId: number, bookingId: string, revision: number,
  decision: 'confirmed' | 'rejected', responseText?: string | null, now = new Date(),
) {
  const response = cleanUserText(responseText, 1000) || null
  if (decision === 'rejected' && (!response || response.length < 3)) throw new Error('دلیل رد درخواست را ثبت کنید.')
  return withDbTransaction(async () => {
    const access = await requireStableVenueWrite(session, placeId)
    const db = getDb()
    const [row] = await db.select().from(bookingRequest).where(eq(bookingRequest.id, bookingId)).for('update')
    if (!row || row.placeId !== placeId) throw new Error('درخواست در این شعبه پیدا نشد.')
    if (row.status !== 'pending' || row.revision !== revision) throw new Error('این درخواست قبلاً پاسخ گرفته یا تغییر کرده است؛ صفحه را تازه کنید.')
    assertBookingTransition(row.status, decision, 'venue', row.requestedDate, row.requestedLocalTime, now)
    await db.update(bookingRequest).set({
      status: decision, venueResponse: response, respondedAt: now,
      respondedByUserId: access.actor.userId, revision: revision + 1,
    }).where(eq(bookingRequest.id, bookingId))
    await db.insert(bookingStatusHistory).values({
      bookingId, fromStatus: 'pending', toStatus: decision, actorUserId: access.actor.userId,
      note: decision === 'rejected' ? response?.slice(0, 300) : null,
    })
    await recordAudit(access.actor, `booking.${decision}`, 'booking_request', bookingId,
      { placeId, status: 'pending' }, { placeId, status: decision })
    return { status: decision, revision: revision + 1 }
  })
}

export async function completeVenueBookingRequest(session: Session, placeId: number, bookingId: string, revision: number, now = new Date()) {
  return withDbTransaction(async () => {
    const access = await requireStableVenueWrite(session, placeId)
    const db = getDb()
    const [row] = await db.select().from(bookingRequest).where(eq(bookingRequest.id, bookingId)).for('update')
    if (!row || row.placeId !== placeId) throw new Error('درخواست در این شعبه پیدا نشد.')
    if (row.revision !== revision) throw new Error('درخواست تغییر کرده است؛ صفحه را تازه کنید.')
    assertBookingTransition(row.status, 'completed', 'venue', row.requestedDate, row.requestedLocalTime, now)
    await db.update(bookingRequest).set({ status: 'completed', revision: revision + 1 }).where(eq(bookingRequest.id, bookingId))
    await db.insert(bookingStatusHistory).values({ bookingId, fromStatus: 'confirmed', toStatus: 'completed', actorUserId: access.actor.userId })
    await recordAudit(access.actor, 'booking.completed', 'booking_request', bookingId,
      { placeId, status: 'confirmed' }, { placeId, status: 'completed' })
    return { status: 'completed' as const, revision: revision + 1 }
  })
}

/** Internal bounded maintenance entry point; it does not run during a page read. */
export async function expireOverdueBookingRequests(now = new Date(), limit = 100): Promise<number> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('حد پردازش نامعتبر است.')
  const today = tehranCivilNow(now).date
  const candidates = await getDb().select({ id: bookingRequest.id }).from(bookingRequest)
    .where(and(eq(bookingRequest.status, 'pending'), lte(bookingRequest.requestedDate, today)))
    .orderBy(bookingRequest.requestedDate, bookingRequest.requestedLocalTime).limit(limit)
  let expired = 0
  for (const candidate of candidates) {
    const changed = await withDbTransaction(async () => {
      const db = getDb()
      const [row] = await db.select().from(bookingRequest).where(eq(bookingRequest.id, candidate.id)).for('update')
      if (!row || row.status !== 'pending' || !isProposedTimePast(row.requestedDate, row.requestedLocalTime, now)) return false
      assertBookingTransition(row.status, 'expired', 'system', row.requestedDate, row.requestedLocalTime, now)
      await db.update(bookingRequest).set({ status: 'expired', revision: row.revision + 1 }).where(eq(bookingRequest.id, row.id))
      await db.insert(bookingStatusHistory).values({ bookingId: row.id, fromStatus: 'pending', toStatus: 'expired', actorUserId: null })
      await db.insert(auditLog).values({ actorUserId: null, actorLabel: 'system', action: 'booking.expired', entity: 'booking_request',
        entityId: row.id, before: { placeId: row.placeId, status: 'pending' }, after: { placeId: row.placeId, status: 'expired' } })
      return true
    })
    if (changed) expired++
  }
  return expired
}

export async function getVenueBookingConfiguration(session: Session, placeId: number): Promise<VenueBookingConfiguration | null> {
  const access = await authorizeVenueSession(session, placeId)
  if (!access.ok) throw new Error(access.error)
  const [row] = await getDb().select().from(venueBookingSettings)
    .where(eq(venueBookingSettings.placeId, placeId)).limit(1)
  return row ? asConfiguration(row) : null
}
