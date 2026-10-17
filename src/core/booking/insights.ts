import 'server-only'

import { desc, eq, isNotNull, sql } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { appUser, bookingRequest, eventParticipation, venueEvent } from '@/db/schema'
import type { Session } from '@/core/auth/currentUser'

export type CoordinationMetrics = {
  booking: { total: number; pending: number; confirmed: number; rejected: number; cancelled: number;
    expired: number; completed: number; averageResponseMinutes: number | null }
  byKind: { kind: string; total: number }[]
  byExperience: { slug: string; total: number }[]
  events: { published: number; participationRequests: number; interested: number; pending: number; confirmed: number }
}

/** Aggregate only; no customer identifiers, contact details or request notes leave this service. */
export async function getCoordinationMetrics(session: Session): Promise<CoordinationMetrics> {
  if (!session.user || session.actor || session.user.role !== 'admin') throw new Error('این گزارش فقط برای ادمین است.')
  const db = getDb()
  const [account] = await db.select({ role: appUser.role, status: appUser.status,
    mustChangePassword: appUser.mustChangePassword }).from(appUser).where(eq(appUser.id, session.user.id)).limit(1)
  if (!account || account.role !== 'admin' || account.status !== 'active' || account.mustChangePassword) {
    throw new Error('دسترسی ادمین معتبر نیست.')
  }
  const [bookings, kinds, experiences, events, participations] = await Promise.all([
    db.select({ total: sql<number>`COUNT(*)`,
      pending: sql<number>`SUM(${bookingRequest.status} = 'pending')`,
      confirmed: sql<number>`SUM(${bookingRequest.status} = 'confirmed')`,
      rejected: sql<number>`SUM(${bookingRequest.status} = 'rejected')`,
      cancelled: sql<number>`SUM(${bookingRequest.status} = 'cancelled')`,
      expired: sql<number>`SUM(${bookingRequest.status} = 'expired')`,
      completed: sql<number>`SUM(${bookingRequest.status} = 'completed')`,
      responseSeconds: sql<number | null>`AVG(TIMESTAMPDIFF(SECOND, ${bookingRequest.createdAt}, ${bookingRequest.respondedAt}))`,
    }).from(bookingRequest),
    db.select({ kind: bookingRequest.kind, total: sql<number>`COUNT(*)` }).from(bookingRequest)
      .groupBy(bookingRequest.kind).orderBy(desc(sql`COUNT(*)`)).limit(10),
    db.select({ slug: bookingRequest.experienceSlug, total: sql<number>`COUNT(*)` }).from(bookingRequest)
      .where(isNotNull(bookingRequest.experienceSlug)).groupBy(bookingRequest.experienceSlug)
      .orderBy(desc(sql`COUNT(*)`)).limit(20),
    db.select({ published: sql<number>`SUM(${venueEvent.status} = 'published')` }).from(venueEvent),
    db.select({ total: sql<number>`COUNT(*)`, interested: sql<number>`SUM(${eventParticipation.status} = 'interested')`,
      pending: sql<number>`SUM(${eventParticipation.status} = 'pending')`,
      confirmed: sql<number>`SUM(${eventParticipation.status} = 'confirmed')` }).from(eventParticipation),
  ])
  const row = bookings[0], event = events[0], participation = participations[0]
  const num = (value: unknown) => Number(value ?? 0)
  return {
    booking: { total: num(row?.total), pending: num(row?.pending), confirmed: num(row?.confirmed),
      rejected: num(row?.rejected), cancelled: num(row?.cancelled), expired: num(row?.expired), completed: num(row?.completed),
      averageResponseMinutes: row?.responseSeconds == null ? null : Math.round(num(row.responseSeconds) / 60) },
    byKind: kinds.map(item => ({ kind: item.kind, total: num(item.total) })),
    byExperience: experiences.filter(item => item.slug).map(item => ({ slug: item.slug!, total: num(item.total) })),
    events: { published: num(event?.published), participationRequests: num(participation?.total),
      interested: num(participation?.interested), pending: num(participation?.pending), confirmed: num(participation?.confirmed) },
  }
}
