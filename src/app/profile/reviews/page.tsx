import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/core/auth/currentUser'
import { listMyReviews } from '@/core/user/userData'
import { fa } from '@/lib/format'
import { authUrl, paths } from '@/routes'
import styles from '../page.module.css'
import { Stars } from '@/components/ui/Stars'
import { ArrowLeft } from 'lucide-react'

export const metadata: Metadata = {
  title: 'نظرهای من',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

const STATUS_LABEL: Record<string, string> = {
  pending: 'در انتظار تأیید',
  approved: 'منتشر شده',
  rejected: 'تأیید نشد',
  spam: 'رد شد',
}

const STATUS_CLASS: Record<string, string> = {
  pending: styles.statusPending,
  approved: styles.statusApproved,
  rejected: styles.statusRejected,
  spam: styles.statusRejected,
}

export default async function MyReviewsPage() {
  const user = await getCurrentUser()
  if (!user) redirect(authUrl(paths.myReviews))

  const reviews = await listMyReviews(user.id)

  return (
    <div className={styles.page}>
      <Link href={paths.profile} className={styles.backLink}>
        <ArrowLeft size={15} aria-hidden="true" /> پنل من
      </Link>
      <h1 className={styles.title}>نظرهای من</h1>
      <p className={styles.lede}>
        {reviews.length === 0
          ? 'هنوز نظری ثبت نکرده‌ای.'
          : `${fa(reviews.length)} نظر. نظرها بعد از بررسی منتشر می‌شوند.`}
      </p>

      {reviews.length === 0 ? (
        <p className={styles.emptyNote}>
          در صفحه‌ی هر کافه می‌توانی نظرت را بنویسی. <Link href={paths.search}>گشتن در کافه‌ها</Link>
        </p>
      ) : (
        <ul className={styles.itemList}>
          {reviews.map((review) => (
            <li key={review.id} className={styles.item}>
              <div className={styles.itemHead}>
                <Link href={paths.cafe(review.placeSlug)}>{review.placeName}</Link>
                <span className={STATUS_CLASS[review.status] ?? styles.statusPending}>
                  {STATUS_LABEL[review.status] ?? review.status}
                </span>
              </div>
              <p className={styles.stars}>
                <Stars count={review.stars} size={15} showEmpty />
              </p>
              {review.itemNames.length > 0 && (
                <p className={styles.reviewItems}>سفارش: {review.itemNames.join('، ')}</p>
              )}
              {review.text && <p className={styles.itemText}>{review.text}</p>}
              {/* دلیل ردشدن به کاربر گفته می‌شود. نظری که بی‌توضیح رد شود،
                  کاربر را از مشارکت دوباره دلسرد می‌کند. */}
              {review.rejectReason && (
                <p className={styles.rejectNote}>دلیل: {review.rejectReason}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
