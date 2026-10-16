import 'server-only'

import { and, desc, eq, inArray } from 'drizzle-orm'
import type { Session } from '@/core/auth/currentUser'
import { getDb } from '@/db/client'
import { bookingRequest, bookingStatusHistory, eventParticipation, eventParticipationHistory,
  place, venueEvent } from '@/db/schema'

export type AccountUpdate = {
  id: string
  kind: 'booking' | 'event' | 'event_status'
  title: string
  detail: string
  href: string
  createdAt: Date
}

const bookingMessage: Record<string, string> = {
  pending: 'درخواست ثبت شد و در انتظار پاسخ کافه است.', confirmed: 'کافه درخواست را تأیید کرد.',
  rejected: 'کافه درخواست را رد کرد.', cancelled: 'درخواست لغو شد.',
  expired: 'زمان پاسخ‌گویی درخواست به پایان رسید.', completed: 'مراجعه انجام‌شده ثبت شد.',
}
const eventMessage: Record<string, string> = {
  interested: 'علاقه‌مندی ثبت شد؛ بلیت یا حضور قطعی نیست.', pending: 'درخواست شرکت ثبت شد و در انتظار پاسخ کافه است.',
  confirmed: 'کافه شرکت شما را تأیید کرد.', rejected: 'کافه درخواست شرکت را رد کرد.',
  cancelled: 'درخواست شرکت لغو شد.',
}

/** Persistent feed derived from transactional status history, without copying contact data. */
export async function listMyAccountUpdates(session: Session, limit = 60): Promise<AccountUpdate[]> {
  if (!session.user || session.actor) throw new Error('به‌روزرسانی‌های خصوصی فقط برای حساب خودتان نمایش داده می‌شوند.')
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('حد گزارش معتبر نیست.')
  const db = getDb(), userId = session.user.id
  const [bookings, participations, changedEvents] = await Promise.all([
    db.select({ id: bookingStatusHistory.id, status: bookingStatusHistory.toStatus,
      createdAt: bookingStatusHistory.createdAt, bookingId: bookingRequest.id, placeName: place.name })
      .from(bookingStatusHistory).innerJoin(bookingRequest, eq(bookingRequest.id, bookingStatusHistory.bookingId))
      .innerJoin(place, eq(place.id, bookingRequest.placeId))
      .where(eq(bookingRequest.requesterUserId, userId)).orderBy(desc(bookingStatusHistory.createdAt)).limit(limit),
    db.select({ id: eventParticipationHistory.id, status: eventParticipationHistory.toStatus,
      createdAt: eventParticipationHistory.createdAt, eventId: venueEvent.id, title: venueEvent.title })
      .from(eventParticipationHistory)
      .innerJoin(eventParticipation, eq(eventParticipation.id, eventParticipationHistory.participationId))
      .innerJoin(venueEvent, eq(venueEvent.id, eventParticipation.eventId))
      .where(eq(eventParticipation.userId, userId)).orderBy(desc(eventParticipationHistory.createdAt)).limit(limit),
    db.select({ id: venueEvent.id, title: venueEvent.title, status: venueEvent.status, updatedAt: venueEvent.updatedAt })
      .from(eventParticipation).innerJoin(venueEvent, eq(venueEvent.id, eventParticipation.eventId))
      .where(and(eq(eventParticipation.userId, userId), inArray(venueEvent.status, ['cancelled', 'ended']),
        inArray(eventParticipation.status, ['interested', 'pending', 'confirmed']))).orderBy(desc(venueEvent.updatedAt)).limit(limit),
  ])
  const updates: AccountUpdate[] = [
    ...bookings.map(row => ({ id: `booking-${row.id}`, kind: 'booking' as const,
      title: `درخواست ${row.placeName}`, detail: bookingMessage[row.status] ?? 'وضعیت درخواست تغییر کرد.',
      href: `/profile/requests/${row.bookingId}`, createdAt: row.createdAt })),
    ...participations.map(row => ({ id: `event-${row.id}`, kind: 'event' as const,
      title: row.title, detail: eventMessage[row.status] ?? 'وضعیت مشارکت تغییر کرد.',
      href: '/profile/events', createdAt: row.createdAt })),
    ...changedEvents.filter(row => row.status === 'cancelled' || row.status === 'ended').map(row => ({
      id: `event-status-${row.id}`, kind: 'event_status' as const, title: row.title,
      detail: row.status === 'cancelled' ? 'کافه این رویداد را لغو کرده است.' : 'این رویداد پایان یافته است.',
      href: `/events/${encodeURIComponent(row.id)}`, createdAt: row.updatedAt,
    })),
  ]
  return updates.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit)
}
