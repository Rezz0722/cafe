import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { getSession } from '@/core/auth/currentUser'
import { authorizeVenueReadSession } from '@/core/auth/venueAccess'
import { listVenueEvents } from '@/core/events/service'
import { EVENT_STATUS_LABEL, eventTimeLabel } from '@/core/events/presentation'
import { getDb } from '@/db/client'
import { place } from '@/db/schema'
import { authUrl, paths } from '@/routes'
import styles from './events.module.css'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'رویدادهای شعبه', robots: { index: false, follow: false } }

export default async function VenueEventsPage({ searchParams }: { searchParams: Promise<{ place?: string }> }) {
  const placeId = Number((await searchParams).place)
  if (!Number.isSafeInteger(placeId) || placeId <= 0) redirect(paths.ownerPanel)
  const session = await getSession()
  if (!session.user) redirect(authUrl(paths.venueEvents(placeId)))
  const access = await authorizeVenueReadSession(session, placeId)
  if (!access.ok) notFound()
  const [[venue], events] = await Promise.all([
    getDb().select({ name: place.name }).from(place).where(eq(place.id, placeId)).limit(1),
    listVenueEvents(session, placeId),
  ])
  if (!venue) notFound()
  return <main className={styles.page}>
    <nav className={styles.nav}><Link href={`${paths.ownerPanel}?place=${placeId}`}>پنل {venue.name}</Link><span aria-hidden="true"> / </span>رویدادها</nav>
    <header className={styles.header}><div><span className={styles.kicker}>برنامه‌های واقعی شعبه</span><h1>رویدادهای {venue.name}</h1><p>رویداد ابتدا پیش‌نویس است؛ فقط پس از تأیید جداگانه منتشر می‌شود.</p></div>
      {!session.actor && <Link className={styles.primaryLink} href={`/admin/venue/events/new?place=${placeId}`}>رویداد تازه</Link>}
    </header>
    {session.actor && <p className={styles.notice}>حالت مشاهده به‌عنوان فقط‌خواندنی است.</p>}
    <section className={styles.card}><h2>فهرست رویدادها</h2>
      {events.length === 0 ? <p>هنوز رویدادی تعریف نشده است. هیچ برنامه‌ای به‌صورت فرضی نمایش داده نمی‌شود.</p>
        : <ul className={styles.list}>{events.map(event => <li key={event.id}>
          <div><strong>{event.title}</strong><span>{eventTimeLabel(event.startDate, event.startLocalTime)} · {EVENT_STATUS_LABEL[event.status]}</span></div>
          <Link href={`/admin/venue/events/${event.id}?place=${placeId}`}>جزئیات و درخواست‌ها</Link>
        </li>)}</ul>}
    </section>
  </main>
}
