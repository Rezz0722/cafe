import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { getSession } from '@/core/auth/currentUser'
import { getVenueBookingRequest } from '@/core/booking/service'
import { BOOKING_KIND_LABEL, BOOKING_STATUS_LABEL, bookingDateLabel } from '@/core/booking/presentation'
import { getDb } from '@/db/client'
import { place } from '@/db/schema'
import { authUrl, paths } from '@/routes'
import { BookingResponseForm } from '../BookingResponseForm'
import styles from '../bookings.module.css'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'بررسی درخواست رزرو', robots: { index: false, follow: false } }

export default async function VenueBookingDetailPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ place?: string }>
}) {
  const { id } = await params
  const query = await searchParams
  const placeId = Number(query.place)
  if (!Number.isSafeInteger(placeId) || placeId <= 0) notFound()
  const session = await getSession()
  if (!session.user) redirect(authUrl(`/admin/venue/bookings/${encodeURIComponent(id)}?place=${placeId}`))
  let row: Awaited<ReturnType<typeof getVenueBookingRequest>>
  try { row = await getVenueBookingRequest(session, placeId, id) } catch { notFound() }
  if (!row) notFound()
  const [venue] = await getDb().select({ name: place.name, slug: place.slug }).from(place).where(eq(place.id, placeId)).limit(1)
  if (!venue) notFound()
  const { request, items } = row
  return <main className={styles.page}>
    <nav className={styles.nav}><Link href={paths.venueBookings(placeId)}>درخواست‌های {venue.name}</Link><span aria-hidden="true"> / </span>جزئیات</nav>
    <header className={styles.header}><div><span className={styles.kicker}>{BOOKING_KIND_LABEL[request.kind]}</span><h1>درخواست برای {venue.name}</h1><p>{BOOKING_STATUS_LABEL[request.status]}</p></div></header>
    <section className={styles.detail}>
      <dl>
        <div><dt>زمان پیشنهادی</dt><dd>{bookingDateLabel(request.requestedDate, request.requestedLocalTime)}</dd></div>
        <div><dt>تعداد نفرات</dt><dd>{new Intl.NumberFormat('fa-IR').format(request.partySize)}</dd></div>
        <div><dt>شمارهٔ تماس تأییدشده</dt><dd dir="ltr">{request.contactPhone}</dd></div>
        {request.durationMinutes && <div><dt>مدت پیشنهادی</dt><dd>{new Intl.NumberFormat('fa-IR').format(request.durationMinutes)} دقیقه</dd></div>}
      </dl>
      {request.customerNote && <p className={styles.note}>توضیح کاربر: {request.customerNote}</p>}
      {(request.needsCake || request.needsDecoration || request.needsPrivateSpace) && <p className={styles.note}>نیازهای درخواست‌شده: {[request.needsCake && 'کیک', request.needsDecoration && 'تزئین', request.needsPrivateSpace && 'فضای خصوصی'].filter(Boolean).join('، ')}. این موارد تعهد قطعی کافه نیستند.</p>}
      {items.length > 0 && <div className={styles.items}><h2>اقلام موردنظر پیش از مراجعه</h2><p>این انتخاب سفارش قطعی نیست و قیمت‌های منو ممکن است تغییر کنند.</p><ul>{items.map(item => <li key={item.id}>{item.itemName}{item.variantName ? `، ${item.variantName}` : ''} × {new Intl.NumberFormat('fa-IR').format(item.quantity)} — {item.priceUnknown ? 'قیمت نامعلوم' : `${new Intl.NumberFormat('fa-IR').format(item.unitPriceToman ?? 0)} تومان`}</li>)}</ul></div>}
      {request.venueResponse && <p className={styles.note}>پاسخ ثبت‌شده: {request.venueResponse}</p>}
      {!session.actor && <BookingResponseForm placeId={placeId} bookingId={request.id} revision={request.revision} status={request.status} />}
      <Link href={paths.cafe(venue.slug)}>صفحهٔ عمومی کافه</Link>
    </section>
  </main>
}
