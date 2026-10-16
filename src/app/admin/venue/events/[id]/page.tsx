import type { Metadata } from 'next'
import Link from 'next/link'
import { and, eq } from 'drizzle-orm'
import { notFound, redirect } from 'next/navigation'
import { getSession } from '@/core/auth/currentUser'
import { tehranCivilNow } from '@/core/booking/policy'
import { eventHasEnded } from '@/core/events/policy'
import { getVenueEvent, listVenueEventParticipations } from '@/core/events/service'
import { EVENT_PARTICIPATION_LABEL, EVENT_STATUS_LABEL, eventTimeLabel } from '@/core/events/presentation'
import { getDb } from '@/db/client'
import { media, place, placePhoto } from '@/db/schema'
import { authUrl, paths } from '@/routes'
import { EventEditorForm } from '../EventEditorForm'
import { EventStateForm } from '../EventStateForm'
import { ParticipationResponseForm } from '../ParticipationResponseForm'
import styles from '../events.module.css'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'مدیریت رویداد', robots: { index: false, follow: false } }

export default async function VenueEventDetailPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ place?: string }>
}) {
  const { id } = await params
  const placeId = Number((await searchParams).place)
  if (!Number.isSafeInteger(placeId) || placeId <= 0) notFound()
  const session = await getSession()
  if (!session.user) redirect(authUrl(`/admin/venue/events/${encodeURIComponent(id)}?place=${placeId}`))
  let event: Awaited<ReturnType<typeof getVenueEvent>>
  try { event = await getVenueEvent(session, placeId, id) } catch { notFound() }
  if (!event) notFound()
  const [[venue], participants, photos] = await Promise.all([
    getDb().select({ name: place.name }).from(place).where(eq(place.id, placeId)).limit(1),
    listVenueEventParticipations(session, placeId, id),
    getDb().select({ id: media.id, label: placePhoto.alt }).from(placePhoto)
      .innerJoin(media, eq(media.id, placePhoto.mediaId))
      .where(and(eq(placePhoto.placeId, placeId), eq(media.status, 'ok'))).limit(30),
  ])
  if (!venue) notFound()
  const started = eventHasEnded(event.startDate, event.startLocalTime)
  const ended = eventHasEnded(event.endDate, event.endLocalTime)
  return <main className={styles.page}>
    <nav className={styles.nav}><Link href={paths.venueEvents(placeId)}>رویدادهای {venue.name}</Link><span aria-hidden="true"> / </span>جزئیات</nav>
    <header className={styles.header}><div><span className={styles.kicker}>{EVENT_STATUS_LABEL[event.status]}</span><h1>{event.title}</h1>
      <p>{eventTimeLabel(event.startDate, event.startLocalTime)} · {participants.length} نفر واکنش ثبت کرده‌اند</p></div>
      {event.status === 'published' && <Link href={paths.event(id)}>صفحهٔ عمومی رویداد</Link>}
    </header>
    {session.actor && <p className={styles.notice}>حالت مشاهده به‌عنوان فقط‌خواندنی است.</p>}
    {event.status === 'draft' && !session.actor && <EventEditorForm placeId={placeId} event={event} photoChoices={photos.map(photo => ({ id: photo.id, label: photo.label || `تصویر ${photo.id}` }))} minDate={tehranCivilNow().date} />}
    <section className={styles.card}><h2>وضعیت و انتشار</h2><p>انتشار رویداد نیازمند تأیید جداگانهٔ کافه است. علاقه‌مندی کاربران به‌معنی حضور قطعی نیست.</p>
      {!session.actor && <EventStateForm placeId={placeId} eventId={id} revision={event.revision} status={event.status} ended={ended} />}
    </section>
    <section className={styles.card}><h2>مشارکت کاربران</h2>
      {participants.length === 0 ? <p>هنوز واکنشی ثبت نشده است.</p> : <ul className={styles.participants}>{participants.map(row => <li key={row.id}>
        <div><strong>{EVENT_PARTICIPATION_LABEL[row.status]}</strong><span>{new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Tehran' }).format(row.createdAt)}</span>
          {row.contactPhone && <span>شمارهٔ تأییدشده: <b dir="ltr">{row.contactPhone}</b></span>}
          {row.customerNote && <p>توضیح: {row.customerNote}</p>}{row.venueResponse && <p>پاسخ: {row.venueResponse}</p>}</div>
        {!session.actor && event.status === 'published' && !started && row.status === 'pending' &&
          <ParticipationResponseForm placeId={placeId} eventId={id} participationId={row.id} revision={row.revision} />}
      </li>)}</ul>}
    </section>
  </main>
}
