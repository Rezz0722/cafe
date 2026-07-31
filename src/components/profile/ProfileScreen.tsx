'use client'

import { useActionState, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { setNameAction, signOutAction } from '@/app/auth/actions'
import { EMPTY_NAME_STATE } from '@/app/auth/state'
import { MobileShell } from '@/components/layout/MobileShell'
import { CafePhoto } from '@/components/ui/CafePhoto'
import { maskPhone } from '@/core/auth/phone'
import { isAdmin, isOwner, ROLE_LABELS, type SessionUser } from '@/core/auth/types'
import { useSavedCafes } from '@/hooks/useSavedCafes'
import { fa, faDecimal } from '@/lib/format'
import { paths } from '@/routes'
import { PRICE_TIER_LABELS } from '@/types'
import type { PriceTier } from '@/core/places/types'
import styles from './ProfileScreen.module.css'

/**
 * آن‌قدر از یک مکان که ردیف «ذخیره‌شده‌ها» لازم دارد.
 *
 * کل `PlaceView` رد نمی‌شود: هر مکان منو، نظرها و ردِ منشأ را با خودش دارد و
 * چون این کامپوننت کلاینت است، همه‌ی آن داده در payload صفحه سریالایز می‌شد.
 */
export interface SavedVenue {
  slug: string
  name: string
  districtName: string
  /** میانگین خام، فقط برای نمایش. */
  rating: number
  priceTier: PriceTier
  photo?: string
}

/**
 * پروفایل کاربر.
 *
 * `user` از سرور می‌آید (`requireUser`)، پس دیگر نه نگهبان کلاینتی لازم است و
 * نه پرچم `ready`: صفحه یا رندر می‌شود یا اصلاً به مرورگر نمی‌رسد.
 *
 * `venues` همه‌ی مکان‌های منتشرشده است — ذخیره‌شده‌ها با کلید slug در
 * localStorage می‌نشینند، پس فهرست واقعی فقط سمت کلاینت قابل ساخت است.
 */
export function ProfileScreen({ user, venues }: { user: SessionUser; venues: SavedVenue[] }) {
  const router = useRouter()
  const { saved, unsave, ready: savedReady } = useSavedCafes()
  const [signingOut, startSignOut] = useTransition()
  const [editingName, setEditingName] = useState(false)
  const [nameState, saveName] = useActionState(setNameAction, EMPTY_NAME_STATE)

  const name = user.name || 'کاربر کافه‌گرد'
  const savedVenues = venues.filter((venue) => saved.has(venue.slug))
  const owner = isOwner(user)

  function handleSignOut() {
    /*
      خروج، کوکی را روی سرور پاک می‌کند و بعد به خانه می‌رویم — نه رفرش همین
      صفحه. رفرش، `requireUser` را بیدار می‌کرد و کاربر به‌جای خانه به صفحه‌ی
      ورود پرت می‌شد؛ که برای کسی که «خروج» زده پیام گیج‌کننده‌ای است.
    */
    startSignOut(async () => {
      await signOutAction()
      router.replace(paths.home)
      router.refresh()
    })
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
                {fa(maskPhone(user.phone))}
              </div>
              <div className={styles.roleBadge}>{ROLE_LABELS[user.role]}</div>
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
            <span className={styles.sectionCount}>{`${fa(savedVenues.length)} کافه`}</span>
          </div>

          {/* تا وقتی localStorage خوانده نشده، «هیچی ذخیره نکردی» دروغ است. */}
          {!savedReady ? (
            <div className={styles.emptyCard}>
              <div className={styles.emptyText}>در حال بارگذاری…</div>
            </div>
          ) : savedVenues.length > 0 ? (
            <ul className={styles.savedList}>
              {savedVenues.map((venue) => (
                <li key={venue.slug} className={styles.savedRow}>
                  {/* The unsave control is a sibling of the link, not a child of
                      it, so opening the venue and forgetting it stay separate. */}
                  <Link href={paths.cafe(venue.slug)} className={styles.savedMain}>
                    <div className={styles.savedPhoto}>
                      <CafePhoto alt={`فضای ${venue.name}`} src={venue.photo} />
                    </div>
                    <div className={styles.savedBody}>
                      <div className={styles.savedName}>{venue.name}</div>
                      <div className={styles.savedHood}>{venue.districtName}</div>
                      <div className={styles.savedMeta}>
                        <span className={styles.star} aria-hidden="true">
                          ★
                        </span>
                        {faDecimal(Number(venue.rating.toFixed(1)))}
                        <span className={styles.dot} aria-hidden="true">
                          ·
                        </span>
                        <span className={styles.savedPrice}>
                          {PRICE_TIER_LABELS[venue.priceTier]}
                        </span>
                      </div>
                    </div>
                  </Link>

                  <button
                    type="button"
                    className={styles.unsaveButton}
                    onClick={() => unsave(venue.slug)}
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
            <Link href={paths.home} className={styles.emptyCard}>
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
            {/*
              قبلاً این ردیف به `/auth?edit=1` می‌رفت — مسیری که با بازنویسی
              ورود حذف شد. لینکِ مرده بدتر از نبودِ لینک است، پس ویرایش نام
              همین‌جا انجام می‌شود با همان اکشنی که گام آخر ثبت‌نام استفاده می‌کند.
              «عکس» از عنوان حذف شد چون آپلود عکس هنوز واقعی نیست.
            */}
            {editingName ? (
              <form action={saveName} className={styles.nameForm}>
                <input
                  name="name"
                  className={styles.nameInput}
                  defaultValue={user.name}
                  maxLength={60}
                  placeholder="نام شما"
                  required
                  autoFocus
                />
                {nameState.error && <span className={styles.nameError}>{nameState.error}</span>}
                <div className={styles.nameActions}>
                  <button type="submit" className={styles.nameSave}>
                    ذخیره
                  </button>
                  <button
                    type="button"
                    className={styles.nameCancel}
                    onClick={() => setEditingName(false)}
                  >
                    انصراف
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                className={styles.settingRow}
                onClick={() => setEditingName(true)}
              >
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
                  ویرایش نام
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
              </button>
            )}

            <button
              type="button"
              className={`${styles.settingRow} ${styles.logoutRow}`}
              onClick={handleSignOut}
              disabled={signingOut}
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
                {signingOut ? 'در حال خروج…' : 'خروج از حساب'}
              </span>
            </button>
          </div>
        </section>

        {/* ===== panels ===== */}
        {/*
          فقط به کسی نشان داده می‌شود که واقعاً دسترسی دارد. لینک‌دادن مشتری به
          پنلی که بلافاصله پرتش می‌کند، همان بن‌بستی است که نسخه‌ی قبلی داشت —
          آنجا لینک همیشه بود و به صفحه‌ی ورودِ آزمایشی می‌رفت.
        */}
        {(owner || isAdmin(user)) && (
          <div className={styles.ownerWrap}>
            <Link href={`${paths.admin}/venue`} className={styles.ownerCard}>
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
                  <span className={styles.ownerTitle}>پنل کافه</span>
                  <span className={styles.ownerSub}>
                    {user.ownedPlaceSlugs.length > 0
                      ? 'صفحه‌ات رو مدیریت کن'
                      : 'هنوز کافه‌ای به حسابت وصل نیست'}
                  </span>
                </span>
              </span>
              <Chevron />
            </Link>

            {isAdmin(user) && (
              <Link href={paths.admin} className={`${styles.ownerCard} ${styles.adminCard}`}>
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
                      <path d="M12 3l7.5 3.4V12c0 4.6-3.2 7.9-7.5 9-4.3-1.1-7.5-4.4-7.5-9V6.4z" />
                      <path d="M9.2 12.2l2 2 3.6-3.9" />
                    </svg>
                  </span>
                  <span>
                    <span className={styles.ownerTitle}>پنل ادمین</span>
                    <span className={styles.ownerSub}>کاتالوگ، صف اعتبارسنجی و کاربران</span>
                  </span>
                </span>
                <Chevron />
              </Link>
            )}
          </div>
        )}
      </div>
    </MobileShell>
  )
}

function Chevron() {
  return (
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
  )
}
