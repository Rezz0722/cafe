import 'server-only'

import { randomUUID } from 'node:crypto'
import { and, asc, desc, eq, gte, like, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { afterDbCommit, getDb, withDbTransaction } from '@/db/client'
import { appUser, eventParticipation, eventParticipationHistory, media, place,
  placePhoto, userPlaceRole, venueEvent } from '@/db/schema'
import type { Session } from '@/core/auth/currentUser'
import { authorizeVenueReadSession, authorizeVenueSession } from '@/core/auth/venueAccess'
import { cleanUserText } from '@/core/security/input'
import { recordAudit } from '@/core/places/manage'
import { mediaPublicUrl } from '@/core/media/store'
import { eventHasEnded, normalizeEventDraft, type EventDraft } from './policy'
import { tehranCivilNow } from '@/core/booking/policy'

async function requireVenueWrite(session: Session, placeId: number) {
  const access = await authorizeVenueSession(session, placeId)
  if (!access.ok) throw new Error(access.error)
  const [account] = await getDb().select({ role: appUser.role, status: appUser.status, mustChangePassword: appUser.mustChangePassword })
    .from(appUser).where(eq(appUser.id, access.actor.userId)).for('update')
  if (!account || account.status !== 'active' || account.mustChangePassword) throw new Error('حساب فعال نیست.')
  if (account.role !== 'admin') {
    const [assignment] = await getDb().select({ role: userPlaceRole.role, status: userPlaceRole.status })
      .from(userPlaceRole).where(and(eq(userPlaceRole.userId, access.actor.userId), eq(userPlaceRole.placeId, placeId))).for('update')
    if (account.role !== 'owner' || assignment?.status !== 'active' ||
      !['owner', 'manager'].includes(assignment.role)) throw new Error('دسترسی این شعبه معتبر نیست.')
  }
  return access
}

async function requireEventCustomer(session: Session, requireVerifiedPhone: boolean) {
  if (!session.user || session.actor) throw new Error('برای شرکت در رویداد با حساب خود وارد شوید.')
  const [account] = await getDb().select({ id: appUser.id, name: appUser.name, phone: appUser.phone,
    phoneVerifiedAt: appUser.phoneVerifiedAt, status: appUser.status, mustChangePassword: appUser.mustChangePassword })
    .from(appUser).where(eq(appUser.id, session.user.id)).for('update')
  if (!account || account.status !== 'active' || account.mustChangePassword ||
    (requireVerifiedPhone && (!account.phone || !account.phoneVerifiedAt))) {
    throw new Error('برای این درخواست، حساب فعال با شمارهٔ تأییدشده لازم است.')
  }
  return account
}

async function assertCoverBelongsToPlace(placeId: number, coverMediaId: number | null) {
  if (coverMediaId === null) return
  const [photo] = await getDb().select({ id: placePhoto.id }).from(placePhoto)
    .innerJoin(media, eq(media.id, placePhoto.mediaId))
    .where(and(eq(placePhoto.placeId, placeId), eq(placePhoto.mediaId, coverMediaId), eq(media.status, 'ok'))).limit(1)
  if (!photo) throw new Error('تصویر رویداد باید از تصاویر موجود و سالم همین شعبه باشد.')
}

function invalidateEvent(eventId: string) {
  revalidatePath('/events')
  revalidatePath(`/events/${eventId}`)
}

export async function createVenueEvent(session: Session, input: EventDraft, now = new Date()) {
  const draft = normalizeEventDraft(input, now)
  return withDbTransaction(async () => {
    const access = await requireVenueWrite(session, draft.placeId)
    const [venue] = await getDb().select({ status: place.status, kind: place.kind }).from(place)
      .where(eq(place.id, draft.placeId)).limit(1)
    if (!venue || venue.status !== 'published' || venue.kind === 'shop') throw new Error('این شعبه برای انتشار رویداد فعال نیست.')
    await assertCoverBelongsToPlace(draft.placeId, draft.coverMediaId ?? null)
    const id = randomUUID()
    await getDb().insert(venueEvent).values({ ...draft, id, startLocalTime: `${draft.startLocalTime}:00`,
      endLocalTime: `${draft.endLocalTime}:00`, createdByUserId: access.actor.userId,
      updatedByUserId: access.actor.userId, status: 'draft' })
    await recordAudit(access.actor, 'event.created', 'venue_event', id, null,
      { placeId: draft.placeId, status: 'draft', title: draft.title })
    return { id, status: 'draft' as const, revision: 0 }
  })
}

export async function updateDraftVenueEvent(session: Session, eventId: string, revision: number, input: EventDraft, now = new Date()) {
  const draft = normalizeEventDraft(input, now)
  return withDbTransaction(async () => {
    const access = await requireVenueWrite(session, draft.placeId)
    const [row] = await getDb().select().from(venueEvent).where(eq(venueEvent.id, eventId)).for('update')
    if (!row || row.placeId !== draft.placeId) throw new Error('رویداد این شعبه پیدا نشد.')
    if (row.status !== 'draft' || row.revision !== revision) throw new Error('پیش‌نویس تغییر کرده است؛ صفحه را تازه کنید.')
    await assertCoverBelongsToPlace(draft.placeId, draft.coverMediaId ?? null)
    await getDb().update(venueEvent).set({ ...draft, startLocalTime: `${draft.startLocalTime}:00`,
      endLocalTime: `${draft.endLocalTime}:00`, updatedByUserId: access.actor.userId, revision: revision + 1 })
      .where(eq(venueEvent.id, eventId))
    await recordAudit(access.actor, 'event.draft.updated', 'venue_event', eventId,
      { placeId: draft.placeId, revision }, { placeId: draft.placeId, revision: revision + 1 })
    return { id: eventId, revision: revision + 1 }
  })
}

export async function transitionVenueEvent(session: Session, placeId: number, eventId: string,
  revision: number, next: 'published' | 'cancelled' | 'ended', now = new Date(), invalidate = invalidateEvent) {
  return withDbTransaction(async () => {
    const access = await requireVenueWrite(session, placeId)
    const [row] = await getDb().select().from(venueEvent).where(eq(venueEvent.id, eventId)).for('update')
    if (!row || row.placeId !== placeId) throw new Error('رویداد این شعبه پیدا نشد.')
    if (row.revision !== revision) throw new Error('رویداد تغییر کرده است؛ صفحه را تازه کنید.')
    if (next === 'published') {
      if (row.status !== 'draft' || eventHasEnded(row.startDate, row.startLocalTime, now)) throw new Error('فقط پیش‌نویس آینده را می‌توان منتشر کرد.')
      const [venue] = await getDb().select({ status: place.status }).from(place).where(eq(place.id, placeId)).limit(1)
      if (venue?.status !== 'published') throw new Error('شعبهٔ منتشرنشده نمی‌تواند رویداد عمومی داشته باشد.')
    } else if (row.status !== 'published' || (next === 'ended' && !eventHasEnded(row.endDate, row.endLocalTime, now))) {
      throw new Error('تغییر وضعیت رویداد مجاز نیست.')
    }
    await getDb().update(venueEvent).set({ status: next, revision: revision + 1,
      updatedByUserId: access.actor.userId, ...(next === 'published' ? { publishedAt: now } : {}) })
      .where(eq(venueEvent.id, eventId))
    await recordAudit(access.actor, `event.${next}`, 'venue_event', eventId,
      { placeId, status: row.status }, { placeId, status: next })
    afterDbCommit(() => invalidate(eventId))
    return { status: next, revision: revision + 1 }
  })
}

export async function listVenueEvents(session: Session, placeId: number) {
  const access = await authorizeVenueReadSession(session, placeId)
  if (!access.ok) throw new Error(access.error)
  return getDb().select().from(venueEvent).where(eq(venueEvent.placeId, placeId))
    .orderBy(desc(venueEvent.startDate), desc(venueEvent.startLocalTime)).limit(100)
}

export async function getVenueEvent(session: Session, placeId: number, eventId: string) {
  const access = await authorizeVenueReadSession(session, placeId)
  if (!access.ok) throw new Error(access.error)
  const [row] = await getDb().select().from(venueEvent)
    .where(and(eq(venueEvent.id, eventId), eq(venueEvent.placeId, placeId))).limit(1)
  return row ?? null
}

export async function listUpcomingPublicEvents(options: { limit?: number; fromDate?: string; venueQuery?: string; districtId?: string } = {}) {
  const today = tehranCivilNow().date
  const fromDate = options.fromDate && /^\d{4}-\d{2}-\d{2}$/.test(options.fromDate) && options.fromDate > today ? options.fromDate : today
  const venueQuery = cleanUserText(options.venueQuery, 60)
  const districtId = cleanUserText(options.districtId, 48)
  const rows = await getDb().select({ event: venueEvent, placeName: place.name, placeSlug: place.slug,
    districtId: place.districtId, coverPath: media.localPath }).from(venueEvent)
    .innerJoin(place, eq(place.id, venueEvent.placeId))
    .leftJoin(media, eq(media.id, venueEvent.coverMediaId))
    .where(and(eq(venueEvent.status, 'published'), eq(place.status, 'published'), gte(venueEvent.endDate, fromDate),
      venueQuery ? like(place.name, `%${venueQuery}%`) : undefined,
      districtId ? eq(place.districtId, districtId) : undefined))
    .orderBy(asc(venueEvent.startDate), asc(venueEvent.startLocalTime)).limit(Math.min(Math.max(options.limit ?? 40, 1), 100))
  return rows.filter(row => !eventHasEnded(row.event.endDate, row.event.endLocalTime))
    .map(row => ({ ...row, coverUrl: mediaPublicUrl(row.coverPath) }))
}

export async function getMyEventParticipation(session: Session, eventId: string) {
  if (!session.user || session.actor) return null
  const [row] = await getDb().select().from(eventParticipation)
    .where(and(eq(eventParticipation.eventId, eventId), eq(eventParticipation.userId, session.user.id))).limit(1)
  return row ?? null
}

export async function getPublicEvent(eventId: string) {
  const [row] = await getDb().select({ event: venueEvent, placeName: place.name, placeSlug: place.slug,
    placeStatus: place.status, coverPath: media.localPath }).from(venueEvent)
    .innerJoin(place, eq(place.id, venueEvent.placeId))
    .leftJoin(media, eq(media.id, venueEvent.coverMediaId))
    .where(eq(venueEvent.id, eventId)).limit(1)
  if (!row || row.event.status === 'draft' || row.placeStatus !== 'published') return null
  return { ...row, coverUrl: mediaPublicUrl(row.coverPath) }
}

export async function requestEventParticipation(session: Session, eventId: string, note?: string | null, now = new Date()) {
  return withDbTransaction(async () => {
    const db = getDb()
    if (!session.user || session.actor) throw new Error('برای شرکت در رویداد با حساب خود وارد شوید.')
    const [event] = await db.select({ event: venueEvent, placeStatus: place.status }).from(venueEvent)
      .innerJoin(place, eq(place.id, venueEvent.placeId))
      .where(eq(venueEvent.id, eventId)).for('update')
    if (!event || event.event.status !== 'published' || event.placeStatus !== 'published' ||
      eventHasEnded(event.event.startDate, event.event.startLocalTime, now)) throw new Error('پذیرش درخواست این رویداد فعال نیست.')
    const account = await requireEventCustomer(session, event.event.participationMode === 'request')
    const [existing] = await db.select().from(eventParticipation)
      .where(and(eq(eventParticipation.eventId, eventId), eq(eventParticipation.userId, account.id))).limit(1)
    if (existing) return { id: existing.id, status: existing.status, repeated: true }
    const [rate] = await db.select({ total: sql<number>`COUNT(*)` }).from(eventParticipation)
      .where(and(eq(eventParticipation.userId, account.id), gte(eventParticipation.createdAt, new Date(now.getTime() - 86_400_000))))
    if (Number(rate?.total ?? 0) >= 10) throw new Error('تعداد درخواست‌های رویداد شما در روز به حد مجاز رسیده است.')
    const status = event.event.participationMode === 'interest' ? 'interested' as const : 'pending' as const
    const id = randomUUID(), customerNote = cleanUserText(note, 500) || null
    await db.insert(eventParticipation).values({ id, eventId, userId: account.id, status,
      contactPhone: status === 'pending' ? account.phone : null, customerNote })
    await db.insert(eventParticipationHistory).values({ participationId: id, fromStatus: null, toStatus: status, actorUserId: account.id })
    await recordAudit({ userId: account.id, label: account.name || account.id }, 'event.participation.created',
      'event_participation', id, null, { eventId, placeId: event.event.placeId, status })
    return { id, status, repeated: false }
  })
}

export async function listMyEventParticipations(session: Session) {
  if (!session.user || session.actor) throw new Error('برای مشاهدهٔ درخواست‌ها با حساب خود وارد شوید.')
  return getDb().select({ participation: eventParticipation, event: venueEvent,
    placeName: place.name, placeSlug: place.slug }).from(eventParticipation)
    .innerJoin(venueEvent, eq(venueEvent.id, eventParticipation.eventId))
    .innerJoin(place, eq(place.id, venueEvent.placeId))
    .where(eq(eventParticipation.userId, session.user.id)).orderBy(desc(eventParticipation.createdAt)).limit(100)
}

export async function listVenueEventParticipations(session: Session, placeId: number, eventId: string) {
  const access = await authorizeVenueReadSession(session, placeId)
  if (!access.ok) throw new Error(access.error)
  const [event] = await getDb().select({ id: venueEvent.id }).from(venueEvent)
    .where(and(eq(venueEvent.id, eventId), eq(venueEvent.placeId, placeId))).limit(1)
  if (!event) throw new Error('رویداد این شعبه پیدا نشد.')
  return getDb().select().from(eventParticipation).where(eq(eventParticipation.eventId, eventId))
    .orderBy(desc(eventParticipation.createdAt)).limit(100)
}

export async function respondToEventParticipation(session: Session, placeId: number, participationId: string,
  revision: number, decision: 'confirmed' | 'rejected', responseText?: string | null, now = new Date()) {
  const response = cleanUserText(responseText, 500) || null
  if (decision === 'rejected' && (!response || response.length < 3)) throw new Error('دلیل رد درخواست را بنویسید.')
  return withDbTransaction(async () => {
    const access = await requireVenueWrite(session, placeId), db = getDb()
    const [row] = await db.select({ participation: eventParticipation, event: venueEvent }).from(eventParticipation)
      .innerJoin(venueEvent, eq(venueEvent.id, eventParticipation.eventId))
      .where(eq(eventParticipation.id, participationId)).for('update')
    if (!row || row.event.placeId !== placeId || row.participation.status !== 'pending' ||
      row.participation.revision !== revision || row.event.status !== 'published') throw new Error('درخواست تغییر کرده یا متعلق به این شعبه نیست.')
    if (eventHasEnded(row.event.startDate, row.event.startLocalTime, now)) throw new Error('رویداد آغاز شده است؛ پاسخ جدید ممکن نیست.')
    await db.update(eventParticipation).set({ status: decision, revision: revision + 1,
      venueResponse: response, respondedAt: now, respondedByUserId: access.actor.userId })
      .where(eq(eventParticipation.id, participationId))
    await db.insert(eventParticipationHistory).values({ participationId, fromStatus: 'pending', toStatus: decision, actorUserId: access.actor.userId })
    await recordAudit(access.actor, `event.participation.${decision}`, 'event_participation', participationId,
      { placeId, status: 'pending' }, { placeId, status: decision })
    return { status: decision, revision: revision + 1 }
  })
}

export async function cancelMyEventParticipation(session: Session, participationId: string, revision: number) {
  return withDbTransaction(async () => {
    const account = await requireEventCustomer(session, false), db = getDb()
    const [row] = await db.select().from(eventParticipation).where(eq(eventParticipation.id, participationId)).for('update')
    if (!row || row.userId !== account.id || row.revision !== revision || !['interested', 'pending', 'confirmed'].includes(row.status)) {
      throw new Error('درخواست قابل لغو نیست یا تغییر کرده است.')
    }
    await db.update(eventParticipation).set({ status: 'cancelled', revision: revision + 1 }).where(eq(eventParticipation.id, participationId))
    await db.insert(eventParticipationHistory).values({ participationId, fromStatus: row.status, toStatus: 'cancelled', actorUserId: account.id })
    await recordAudit({ userId: account.id, label: account.name || account.id }, 'event.participation.cancelled',
      'event_participation', participationId, { status: row.status }, { status: 'cancelled' })
    return { status: 'cancelled' as const, revision: revision + 1 }
  })
}
