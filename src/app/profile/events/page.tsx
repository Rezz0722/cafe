import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/core/auth/currentUser'
import { listMyEventParticipations } from '@/core/events/service'
import { EVENT_PARTICIPATION_LABEL, eventTimeLabel } from '@/core/events/presentation'
import { authUrl, paths } from '@/routes'
import { CancelEventButton } from './CancelEventButton'
import styles from './events.module.css'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'رویدادهای من', robots: { index: false, follow: false } }

export default async function MyEventsPage() {
  const session = await getSession()
  if (!session.user) redirect(authUrl(paths.myEvents))
  const rows = session.actor ? [] : await listMyEventParticipations(session)
  return <main className={styles.page}>
    <nav><Link href={paths.profile}>پنل من</Link><span aria-hidden="true"> / </span>رویدادهای من</nav>
    <header><span className={styles.kicker}>پیگیری درخواست‌ها</span><h1>رویدادهای من</h1><p>علاقه‌مندی یا ثبت درخواست به‌معنی تأیید حضور نیست؛ پاسخ کافه را اینجا ببینید.</p></header>
    {session.actor ? <p className={styles.empty}>در حالت مشاهده به‌عنوان، اطلاعات خصوصی رویدادها نمایش داده نمی‌شود.</p>
      : rows.length === 0 ? <div className={styles.empty}><h2>هنوز رویدادی دنبال نمی‌کنید</h2><Link href={paths.events}>دیدن رویدادها</Link></div>
        : <ol className={styles.list}>{rows.map(({ participation, event, placeName, placeSlug }) => <li key={participation.id} className={styles.card}>
          <div className={styles.head}><div><Link href={paths.event(event.id)}>{event.title}</Link><p><Link href={paths.cafe(placeSlug)}>{placeName}</Link> · {eventTimeLabel(event.startDate, event.startLocalTime)}</p></div>
            <strong>{EVENT_PARTICIPATION_LABEL[participation.status]}</strong></div>
          {participation.venueResponse && <p>پاسخ کافه: {participation.venueResponse}</p>}
          {event.status === 'cancelled' && <p className={styles.warning}>کافه این رویداد را لغو کرده است.</p>}
          {['pending', 'interested', 'confirmed'].includes(participation.status) && <CancelEventButton participationId={participation.id} revision={participation.revision} />}
        </li>)}</ol>}
  </main>
}
