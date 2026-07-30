import { Link, useNavigate } from 'react-router-dom'
import { MobileShell } from '@/components/layout/MobileShell'
import { CafePhoto } from '@/components/ui/CafePhoto'
import { getCafe } from '@/data/cafes'
import { PRICE_LABELS } from '@/data/taxonomy'
import { useAuth } from '@/hooks/useAuth'
import { useSavedCafes } from '@/hooks/useSavedCafes'
import { fa, faDecimal } from '@/lib/format'
import { editProfileUrl, paths } from '@/routes'
import type { Cafe } from '@/types'
import styles from './ProfilePage.module.css'

/** No phone number is kept with the session, so the header shows the mock one. */
const MASKED_PHONE = '۰۹۱۵ ••• ۴۴۲۱'

export function ProfilePage() {
  const navigate = useNavigate()
  const { user, signOut } = useAuth()
  const { saved, unsave } = useSavedCafes()

  const name = user?.name ?? 'نگار احمدی'
  const savedCafes = Array.from(saved)
    .map(getCafe)
    .filter((cafe): cafe is Cafe => Boolean(cafe))

  function handleSignOut() {
    signOut()
    navigate(paths.home)
  }

  return (
    <MobileShell>
      <div className={styles.page}>
        {/* ===== header ===== */}
        <header className={styles.header}>
          <div className={styles.identity}>
            <div className={styles.avatar} aria-hidden="true">
              {name.trim().charAt(0)}
            </div>
            <div className={styles.identityBody}>
              <div className={styles.name}>{name}</div>
              <div className={styles.phone} dir="ltr">
                {MASKED_PHONE}
              </div>
            </div>
          </div>

          <div className={styles.levelCard}>
            <div className={styles.levelIcon} aria-hidden="true">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 2l2.4 6.9H22l-5.8 4.3L18.4 22 12 17.6 5.6 22l2.2-8.8L2 8.9h7.6z" />
              </svg>
            </div>
            <div>
              <div className={styles.levelTitle}>کاشف تازه‌کار</div>
              <div className={styles.levelSub}>۱۲۰ امتیاز · تا سطح بعد ۸۰ امتیاز مونده</div>
            </div>
          </div>
        </header>

        {/* ===== saved venues ===== */}
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>کافه‌های ذخیره‌شده</h2>
            <span className={styles.sectionCount}>{`${fa(savedCafes.length)} کافه`}</span>
          </div>

          {savedCafes.length > 0 ? (
            <ul className={styles.savedList}>
              {savedCafes.map((cafe) => (
                <li key={cafe.id} className={styles.savedRow}>
                  {/* The unsave control is a sibling of the link, not a child of
                      it, so opening the venue and forgetting it stay separate. */}
                  <Link to={paths.cafe(cafe.id)} className={styles.savedMain}>
                    <div className={styles.savedPhoto}>
                      <CafePhoto alt={`فضای ${cafe.name}`} />
                    </div>
                    <div className={styles.savedBody}>
                      <div className={styles.savedName}>{cafe.name}</div>
                      <div className={styles.savedHood}>{cafe.hood}</div>
                      <div className={styles.savedMeta}>
                        <span className={styles.star} aria-hidden="true">
                          ★
                        </span>
                        {faDecimal(cafe.rating)}
                        <span className={styles.dot} aria-hidden="true">
                          ·
                        </span>
                        <span className={styles.savedPrice}>{PRICE_LABELS[cafe.priceKey]}</span>
                      </div>
                    </div>
                  </Link>

                  <button
                    type="button"
                    className={styles.unsaveButton}
                    onClick={() => unsave(cafe.id)}
                    aria-label="حذف از ذخیره"
                  >
                    <svg
                      width="19"
                      height="19"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <Link to={paths.home} className={styles.emptyCard}>
              <div className={styles.emptyTitle}>هنوز کافه‌ای ذخیره نکردی</div>
              <div className={styles.emptyText}>بریم چندتا جای خوب پیدا کنیم! →</div>
            </Link>
          )}
        </section>

        {/* ===== my reviews ===== */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>نظرهای من</h2>
          <div className={styles.emptyCard}>
            <div className={styles.emptyTitle}>هنوز نظری ننوشتی</div>
            <div className={styles.emptyText}>تجربه‌ات از یه کافه رو با بقیه به اشتراک بذار.</div>
          </div>
        </section>

        {/* ===== contributions ===== */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>مشارکت‌های من</h2>
          <div className={styles.contribCard}>
            <div className={styles.contribRow}>
              <div className={styles.contribStat}>
                <div className={styles.contribValue}>۷</div>
                <div className={styles.contribLabel}>عکس آپلودشده</div>
              </div>
              <div className={styles.contribStat}>
                <div className={styles.contribValue}>۳</div>
                <div className={styles.contribLabel}>اطلاعات تکمیل‌شده</div>
              </div>
              <div className={styles.contribStat}>
                <div className={styles.contribValue}>۱۲۰</div>
                <div className={styles.contribLabel}>امتیاز</div>
              </div>
            </div>
            <p className={styles.contribNote}>
              دمت گرم! مشارکت تو کمک می‌کنه بقیهٔ جوون‌های مشهد کافه‌های خوب رو پیدا کنن. 🌿
            </p>
          </div>
        </section>

        {/* ===== account settings ===== */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>تنظیمات حساب</h2>
          <div className={styles.settingsCard}>
            <Link to={editProfileUrl()} className={styles.settingRow}>
              <span className={styles.settingLabel}>
                <svg
                  className={styles.editIcon}
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
                </svg>
                ویرایش نام و عکس
              </span>
              <svg
                className={styles.settingChevron}
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </Link>

            <button
              type="button"
              className={`${styles.settingRow} ${styles.logoutRow}`}
              onClick={handleSignOut}
            >
              <span className={styles.settingLabel}>
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                خروج از حساب
              </span>
            </button>
          </div>
        </section>

        {/* ===== venue owner entry ===== */}
        <div className={styles.ownerWrap}>
          <Link to={paths.admin} className={styles.ownerCard}>
            <span className={styles.ownerCopy}>
              <span className={styles.ownerIcon} aria-hidden="true">
                <svg
                  width="21"
                  height="21"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
                  <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4z" />
                  <line x1="6" y1="1" x2="6" y2="4" />
                  <line x1="10" y1="1" x2="10" y2="4" />
                  <line x1="14" y1="1" x2="14" y2="4" />
                </svg>
              </span>
              <span>
                <span className={styles.ownerTitle}>کافه داری؟</span>
                <span className={styles.ownerSub}>صفحه‌ات رو مدیریت کن</span>
              </span>
            </span>
            <svg
              className={styles.ownerChevron}
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </Link>
        </div>
      </div>
    </MobileShell>
  )
}
