import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { SubmitPlaceForm } from '@/components/profile/SubmitPlaceForm'
import { getCurrentUser } from '@/core/auth/currentUser'
import { listDistricts } from '@/core/places/queries'
import { listMySubmissions } from '@/core/user/userData'
import { fa } from '@/lib/format'
import { authUrl, paths } from '@/routes'
import styles from '../page.module.css'

export const metadata: Metadata = {
  title: 'ثبت کافه — کافه‌گرد',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

const STATUS_LABEL: Record<string, string> = {
  pending: 'در انتظار بررسی',
  approved: 'تأیید و منتشر شد',
  rejected: 'تأیید نشد',
  duplicate: 'احتمالاً تکراری — در بررسی',
}

const STATUS_CLASS: Record<string, string> = {
  pending: styles.statusPending,
  approved: styles.statusApproved,
  rejected: styles.statusRejected,
  duplicate: styles.statusPending,
}

export default async function SubmitPlacePage() {
  const user = await getCurrentUser()
  if (!user) redirect(authUrl(paths.submitPlace))

  const [districts, submissions] = await Promise.all([
    listDistricts(),
    listMySubmissions(user.id),
  ])

  return (
    <div className={styles.page}>
      <Link href={paths.profile} className={styles.backLink}>
        ← پنل من
      </Link>
      <h1 className={styles.title}>ثبت کافه‌ی جدید</h1>
      <p className={styles.lede}>
        کافه‌ای می‌شناسی که اینجا نیست؟ همین‌قدر که نامش را بنویسی کافی است. بقیه‌ی
        اطلاعات را ما کامل می‌کنیم.
      </p>

      <SubmitPlaceForm districts={districts.map((d) => ({ id: d.id, name: d.name }))} />

      {submissions.length > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2>ثبت‌های قبلی تو</h2>
            <span className={styles.count}>{fa(submissions.length)}</span>
          </div>
          <ul className={styles.itemList}>
            {submissions.map((submission) => (
              <li key={submission.id} className={styles.item}>
                <div className={styles.itemHead}>
                  {submission.placeSlug ? (
                    <Link href={paths.cafe(submission.placeSlug)}>{submission.name}</Link>
                  ) : (
                    <span>{submission.name}</span>
                  )}
                  <span className={STATUS_CLASS[submission.status] ?? styles.statusPending}>
                    {STATUS_LABEL[submission.status] ?? submission.status}
                  </span>
                </div>
                {submission.note && <p className={styles.rejectNote}>{submission.note}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
