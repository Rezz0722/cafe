import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/core/auth/currentUser'
import { listMyAccountUpdates } from '@/core/notifications/feed'
import { authUrl, paths } from '@/routes'
import styles from './updates.module.css'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'به‌روزرسانی‌های من', robots: { index: false, follow: false } }

export default async function AccountUpdatesPage() {
  const session = await getSession()
  if (!session.user) redirect(authUrl(paths.accountUpdates))
  const updates = session.actor ? [] : await listMyAccountUpdates(session)
  return <main className={styles.page}>
    <nav><Link href={paths.profile}>پنل من</Link><span aria-hidden="true"> / </span>به‌روزرسانی‌ها</nav>
    <header><span>پیگیری شفاف</span><h1>به‌روزرسانی‌های من</h1><p>وضعیت درخواست‌ها و رویدادها فقط پس از ثبت واقعی تغییرات اینجا دیده می‌شود. پیامک یا اعلان بیرونی ارسال نمی‌شود.</p></header>
    {session.actor ? <p className={styles.empty}>در حالت مشاهده به‌عنوان، به‌روزرسانی‌های خصوصی نمایش داده نمی‌شوند.</p>
      : updates.length === 0 ? <div className={styles.empty}><h2>هنوز به‌روزرسانی‌ای ندارید</h2><p>پس از ثبت درخواست واقعی، روند آن را اینجا می‌بینید.</p></div>
        : <ol className={styles.list}>{updates.map(update => <li key={update.id}>
          <div><strong>{update.title}</strong><p>{update.detail}</p><time dateTime={update.createdAt.toISOString()}>{new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Tehran' }).format(update.createdAt)}</time></div>
          <Link href={update.href} aria-label={`دیدن جزئیات ${update.title}`}>دیدن جزئیات</Link>
        </li>)}</ol>}
  </main>
}
