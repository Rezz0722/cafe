import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/core/auth/currentUser'
import { listMyBookingRequests } from '@/core/booking/service'
import { BOOKING_KIND_LABEL, BOOKING_STATUS_LABEL, bookingDateLabel } from '@/core/booking/presentation'
import { authUrl, paths } from '@/routes'
import { CancelBookingButton } from './CancelBookingButton'
import styles from './requests.module.css'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'درخواست‌های من', robots: { index: false, follow: false } }

export default async function MyBookingsPage() {
  const session = await getSession()
  if (!session.user) redirect(authUrl(paths.myBookings))
  const rows = session.actor ? [] : await listMyBookingRequests(session)
  return <main className={styles.page}>
    <nav className={styles.nav}><Link href={paths.profile}>پنل من</Link><span aria-hidden="true"> / </span>درخواست‌های من</nav>
    <header><span className={styles.kicker}>هماهنگی با کافه‌ها</span><h1>درخواست‌های من</h1><p>ثبت درخواست به‌معنی رزرو قطعی نیست؛ وضعیت تأیید را همین‌جا دنبال کنید.</p></header>
    {session.actor ? <p className={styles.empty}>در حالت مشاهده به‌عنوان، درخواست‌های خصوصی در دسترس نیستند.</p>
      : rows.length === 0 ? <div className={styles.empty}><h2>هنوز درخواستی ندارید</h2><p>در صفحهٔ کافه‌هایی که این سرویس را فعال کرده‌اند، می‌توانید درخواست هماهنگی بفرستید.</p><Link href={paths.search}>پیدا کردن کافه</Link></div>
        : <ol className={styles.list}>{rows.map(({ request, placeName, placeSlug }) => <li key={request.id} className={styles.card}>
          <div className={styles.cardHead}><div><Link href={paths.cafe(placeSlug)}>{placeName}</Link><span>{BOOKING_KIND_LABEL[request.kind]}</span></div><strong data-status={request.status}>{BOOKING_STATUS_LABEL[request.status]}</strong></div>
          <p>{bookingDateLabel(request.requestedDate, request.requestedLocalTime)} · {new Intl.NumberFormat('fa-IR').format(request.partySize)} نفر</p>
          {request.venueResponse && <p className={styles.response}>پاسخ کافه: {request.venueResponse}</p>}
          <div className={styles.cardActions}><Link href={`${paths.myBookings}/${request.id}`}>جزئیات درخواست</Link>{request.status === 'pending' && <CancelBookingButton bookingId={request.id} revision={request.revision} />}</div>
        </li>)}</ol>}
  </main>
}
