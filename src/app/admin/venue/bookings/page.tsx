import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { and, eq, sql } from 'drizzle-orm'
import { getSession } from '@/core/auth/currentUser'
import { authorizeVenueReadSession } from '@/core/auth/venueAccess'
import { getVenueBookingConfiguration, listVenueBookingRequests } from '@/core/booking/service'
import { BOOKING_KIND_LABEL, BOOKING_STATUS_LABEL, bookingDateLabel } from '@/core/booking/presentation'
import { getDb } from '@/db/client'
import { BOOKING_STATUS, bookingRequest, place } from '@/db/schema'
import { authUrl, paths } from '@/routes'
import { BookingSettingsForm } from './BookingSettingsForm'
import styles from './bookings.module.css'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'درخواست‌های رزرو شعبه', robots: { index: false, follow: false } }

export default async function VenueBookingsPage({ searchParams }: { searchParams: Promise<{ place?: string; status?: string }> }) {
  const query = await searchParams
  const placeId = Number(query.place)
  if (!Number.isSafeInteger(placeId) || placeId <= 0) redirect(paths.ownerPanel)
  const session = await getSession()
  if (!session.user) redirect(authUrl(paths.venueBookings(placeId)))
  const access = await authorizeVenueReadSession(session, placeId)
  if (!access.ok) notFound()
  const status = BOOKING_STATUS.includes(query.status as (typeof BOOKING_STATUS)[number]) ? query.status as (typeof BOOKING_STATUS)[number] : undefined
  const [[venue], settings, requests, [pending]] = await Promise.all([
    getDb().select({ name: place.name, slug: place.slug }).from(place).where(eq(place.id, placeId)).limit(1),
    getVenueBookingConfiguration(session, placeId),
    listVenueBookingRequests(session, placeId, status),
    getDb().select({ total: sql<number>`COUNT(*)` }).from(bookingRequest).where(and(eq(bookingRequest.placeId, placeId), eq(bookingRequest.status, 'pending'))),
  ])
  if (!venue) notFound()
  return <main className={styles.page}>
    <nav className={styles.nav}><Link href={`${paths.ownerPanel}?place=${placeId}`}>پنل {venue.name}</Link><span aria-hidden="true"> / </span>درخواست‌های رزرو</nav>
    <header className={styles.header}><div><span className={styles.kicker}>هماهنگی با مشتری</span><h1>درخواست‌های {venue.name}</h1><p>هیچ درخواست میز تا پاسخ صریح شما تأیید نمی‌شود.</p></div><span className={styles.pending}>{new Intl.NumberFormat('fa-IR').format(Number(pending?.total ?? 0))} در انتظار</span></header>
    {session.actor ? <p className={styles.empty}>حالت مشاهده به‌عنوان فقط‌خواندنی است؛ برای تغییر تنظیمات از پنل ادمین خارج شوید.</p>
      : <BookingSettingsForm placeId={placeId} settings={settings} />}
    <section className={styles.requests}><div className={styles.requestHeading}><h2>فهرست درخواست‌ها</h2><div className={styles.filters}><Link href={paths.venueBookings(placeId)} aria-current={!status ? 'page' : undefined}>همه</Link><Link href={`${paths.venueBookings(placeId)}&status=pending`} aria-current={status === 'pending' ? 'page' : undefined}>در انتظار</Link><Link href={`${paths.venueBookings(placeId)}&status=confirmed`} aria-current={status === 'confirmed' ? 'page' : undefined}>تأییدشده</Link></div></div>
      {requests.length === 0 ? <p className={styles.empty}>در این وضعیت درخواستی ثبت نشده است.</p> : <ul className={styles.list}>{requests.map(request => <li key={request.id}>
        <div><strong>{BOOKING_KIND_LABEL[request.kind]} · {bookingDateLabel(request.requestedDate, request.requestedLocalTime)}</strong><span>{new Intl.NumberFormat('fa-IR').format(request.partySize)} نفر · {BOOKING_STATUS_LABEL[request.status]}</span></div>
        <Link href={`/admin/venue/bookings/${request.id}?place=${placeId}`}>بررسی درخواست</Link>
      </li>)}</ul>}
    </section>
  </main>
}
