import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PlaceCardView } from '@/components/cafe/PlaceCardView'
import { SignOutButton } from '@/components/profile/SignOutButton'
import { getSession } from '@/core/auth/currentUser'
import { findUserById } from '@/core/auth/userRepo'
import { listPlaceCards } from '@/core/places/queries'
import { rankPlaces } from '@/core/taste/recommend'
import {
  getTasteProfile,
  listMyReviews,
  listMySubmissions,
  listSavedPlaces,
  loadRecommendationCandidates,
  loadRecommendationLabels,
} from '@/core/user/userData'
import { fa, toman } from '@/lib/format'
import { authUrl, paths } from '@/routes'
import styles from './page.module.css'

/**
 * پنل کاربر.
 *
 * ترتیب بخش‌ها: پیشنهاد شخصی (دلیلِ وجود این صفحه) ← ذخیره‌شده‌ها (چیزی که
 * خودِ کاربر ساخته) ← مشارکت ← حساب (کم‌استفاده‌ترین، پس آخر).
 */

export const metadata: Metadata = {
  title: 'پنل من — کافه‌گرد',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

const BUDGET_LABELS = ['', 'اقتصادی', 'متوسط', 'بالا']

export default async function ProfilePage() {
  const { user, actor } = await getSession()
  if (!user) redirect(authUrl(paths.profile))

  const [account, taste, saved, reviews, submissions] = await Promise.all([
    findUserById(user.id),
    getTasteProfile(user.id),
    listSavedPlaces(user.id),
    listMyReviews(user.id),
    listMySubmissions(user.id),
  ])

  const candidates = await loadRecommendationCandidates(
    await listPlaceCards({ limit: 300, sort: 'quality' }),
  )
  const labels = await loadRecommendationLabels()
  const recommendations = rankPlaces(candidates, {
    weights: taste?.weights ?? [],
    budgetBand: taste?.budgetBand ?? null,
    labels,
    limit: 6,
  })

  const answeredCount = taste ? Object.keys(taste.answers).length : 0
  const pendingReviews = reviews.filter((review) => review.status === 'pending').length

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div>
          <h1 className={styles.title}>{account?.name || 'پنل من'}</h1>
          <p className={styles.sub}>
            {account?.phone && <span dir="ltr">{fa(account.phone)}</span>}
            {account?.username && <span> · {account.username}</span>}
            {account?.role === 'owner' && <span> · مالک کافه</span>}
            {account?.role === 'admin' && <span> · مدیر</span>}
          </p>
        </div>
        <div className={styles.headActions}>
          {(account?.role === 'owner' || account?.role === 'admin') && (
            <Link href={paths.ownerPanel} className={styles.headLink}>
              پنل کافه
            </Link>
          )}
          {account?.role === 'admin' && !actor && (
            <Link href={paths.admin} className={styles.headLink}>
              پنل مدیریت
            </Link>
          )}
          {/* در حالت «مشاهده به‌عنوان» دکمه‌ی خروج نمایش داده نمی‌شود؛ راه
              برگشت، نوارِ بالای صفحه است. */}
          {!actor && <SignOutButton />}
        </div>
      </header>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2>پیشنهاد برای تو</h2>
          <Link href={paths.taste} className={styles.sectionLink}>
            {answeredCount > 0 ? 'ویرایش سلیقه' : 'تنظیم سلیقه'}
          </Link>
        </div>

        {answeredCount === 0 ? (
          <div className={styles.emptyCard}>
            <p className={styles.emptyTitle}>هنوز سلیقه‌ات را نمی‌دانیم</p>
            <p className={styles.emptyNote}>
              با شش سؤال کوتاه، پیشنهادها را به سلیقه‌ی خودت نزدیک کن — چه می‌نوشی،
              چقدر خرج می‌کنی، و برای چه به کافه می‌روی.
            </p>
            <Link href={paths.taste} className={styles.primaryLink}>
              شروع سلیقه‌سنجی
            </Link>
          </div>
        ) : recommendations.length === 0 ? (
          <p className={styles.emptyNote}>
            با این سلیقه چیزی پیدا نشد. در <Link href={paths.taste}>تنظیم سلیقه</Link> گزینه‌های
            بیشتری انتخاب کن.
          </p>
        ) : (
          <>
            <p className={styles.sectionNote}>
              بر اساس {fa(answeredCount)} پاسخ تو
              {taste?.budgetBand ? <> · بودجه‌ی {BUDGET_LABELS[taste.budgetBand]}</> : null}
            </p>
            <ul className={styles.cardList}>
              {recommendations.map((item) => (
                <li key={item.place.id}>
                  <PlaceCardView card={item.place} />
                  {item.reasons.length > 0 && (
                    /* دلیلِ پیشنهاد گفته می‌شود. پیشنهادِ بی‌دلیل نه متقاعد
                       می‌کند و نه اگر اشتباه باشد قابل تشخیص است. */
                    <p className={styles.reasons}>{item.reasons.join(' · ')}</p>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2>ذخیره‌شده‌ها</h2>
          <span className={styles.count}>{fa(saved.length)}</span>
        </div>
        {saved.length === 0 ? (
          <p className={styles.emptyNote}>
            هنوز کافه‌ای ذخیره نکرده‌ای. در صفحه‌ی هر کافه دکمه‌ی ذخیره هست.
          </p>
        ) : (
          <ul className={styles.savedList}>
            {saved.map((item) => (
              <li key={item.id}>
                <Link href={paths.cafe(item.slug)} className={styles.savedItem}>
                  {item.logoUrl ? (
                    <img src={item.logoUrl} alt="" width={44} height={44} loading="lazy" />
                  ) : (
                    <span className={styles.savedEmpty} aria-hidden="true">
                      ☕
                    </span>
                  )}
                  <span className={styles.savedBody}>
                    <strong>{item.name}</strong>
                    {item.priceMedian !== null && <span>{toman(item.priceMedian)}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2>مشارکت من</h2>
        </div>
        <div className={styles.contribGrid}>
          <Link href={paths.myReviews} className={styles.contribCard}>
            <span className={styles.contribValue}>{fa(reviews.length)}</span>
            <span className={styles.contribLabel}>نظر ثبت‌شده</span>
            {pendingReviews > 0 && (
              <span className={styles.pendingBadge}>
                {fa(pendingReviews)} در انتظار تأیید
              </span>
            )}
          </Link>

          <Link href={paths.submitPlace} className={styles.contribCard}>
            <span className={styles.contribValue}>{fa(submissions.length)}</span>
            <span className={styles.contribLabel}>کافه‌ی ثبت‌شده</span>
            <span className={styles.contribAction}>ثبت کافه‌ی جدید</span>
          </Link>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2>حساب</h2>
        </div>
        {account?.mustChangePassword && (
          <p className={styles.warnRow}>
            رمز فعلی‌تان موقتی است و مدیر آن را صادر کرده. لطفاً عوضش کنید.
          </p>
        )}
        <div className={styles.accountRows}>
          <Link href={paths.changePassword} className={styles.accountRow}>
            <span>رمز عبور</span>
            <span className={styles.accountValue}>
              {account?.passwordHash ? 'تغییر رمز' : 'تنظیم رمز برای ورود بدون پیامک'}
            </span>
          </Link>
        </div>
      </section>
    </div>
  )
}
