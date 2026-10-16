import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getSession } from '@/core/auth/currentUser'
import { getMyBookingRequest } from '@/core/booking/service'
import { BOOKING_KIND_LABEL, BOOKING_STATUS_LABEL, bookingDateLabel } from '@/core/booking/presentation'
import { authUrl, paths } from '@/routes'
import { CancelBookingButton } from '../CancelBookingButton'
import styles from '../requests.module.css'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'جزئیات درخواست', robots: { index: false, follow: false } }

export default async function BookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getSession()
  if (!session.user) redirect(authUrl(`${paths.myBookings}/${encodeURIComponent(id)}`))
  if (session.actor) notFound()
  const row = await getMyBookingRequest(session, id)
  if (!row) notFound()
  const { request, items, placeName, placeSlug } = row
  return <main className={styles.page}>
    <nav className={styles.nav}><Link href={paths.myBookings}>درخواست‌های من</Link><span aria-hidden="true"> / </span>جزئیات</nav>
    <header><span className={styles.kicker}>{BOOKING_KIND_LABEL[request.kind]}</span><h1>درخواست به {placeName}</h1><p>وضعیت این درخواست: <strong>{BOOKING_STATUS_LABEL[request.status]}</strong></p></header>
    <section className={styles.detail}><dl>
      <div><dt>زمان پیشنهادی</dt><dd>{bookingDateLabel(request.requestedDate, request.requestedLocalTime)}</dd></div>
      <div><dt>تعداد نفرات</dt><dd>{new Intl.NumberFormat('fa-IR').format(request.partySize)}</dd></div>
      <div><dt>تاریخ ثبت</dt><dd>{new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Tehran' }).format(request.createdAt)}</dd></div>
    </dl>
    {request.customerNote && <p>توضیح شما: {request.customerNote}</p>}
    {request.venueResponse && <p className={styles.response}>پاسخ کافه: {request.venueResponse}</p>}
    {items.length > 0 && <div><h2>اقلام موردنظر پیش از مراجعه</h2><p>این انتخاب سفارش قطعی نیست و مبلغ ممکن است تغییر کند.</p><ul>{items.map(item => <li key={item.id}>{item.itemName}{item.variantName ? `، ${item.variantName}` : ''} × {new Intl.NumberFormat('fa-IR').format(item.quantity)} — {item.priceUnknown ? 'قیمت نامعلوم' : `${new Intl.NumberFormat('fa-IR').format(item.unitPriceToman ?? 0)} تومان`}</li>)}</ul></div>}
    <div className={styles.cardActions}><Link href={paths.cafe(placeSlug)}>صفحهٔ کافه</Link>{request.status === 'pending' && <CancelBookingButton bookingId={request.id} revision={request.revision} />}</div>
    </section>
  </main>
}
