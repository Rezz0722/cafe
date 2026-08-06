'use client'

/**
 * پنل مدیریت.
 *
 * ═══ چیدمان بر اساس «چه کاری روی میز است» ═══
 *
 * تب اول **صف کار** است نه آمار: ادمینی که وارد پنل می‌شود معمولاً آمده کاری
 * را انجام بدهد (نظری را تأیید کند، کافه‌ای را بررسی کند)، نه نمودار ببیند.
 * نشانِ عددی روی تب‌ها همان کارهای منتظر را نشان می‌دهد.
 */

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import Link from 'next/link'
import {
  assignPlaceAction,
  createVenueAccountAction,
  moderateReviewAction,
  reviewSubmissionAction,
  setCredentialsAction,
  setPlaceStatusAction,
  setUserBlockedAction,
  setUserRoleAction,
  startViewAsAction,
} from '@/app/admin/actions'
import { EMPTY_ADMIN_STATE, type AdminActionState } from '@/app/admin/state'
import { OperationsPanel } from '@/components/admin/OperationsPanel'
import { SettingsPanel, type SettingsPanelProps } from '@/components/admin/SettingsPanel'
import { fa, faCount } from '@/lib/format'
import { paths } from '@/routes'
import styles from './AdminDashboard.module.css'

type Tab =
  | 'queue'
  | 'traffic'
  | 'places'
  | 'users'
  | 'credentials'
  | 'health'
  | 'settings'
  | 'operations'

function Submit({ label, danger }: { label: string; danger?: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      className={danger ? styles.btnDanger : styles.btn}
      disabled={pending}
    >
      {pending ? '…' : label}
    </button>
  )
}

function Feedback({ state }: { state: AdminActionState }) {
  if (state.error) return <p className={styles.error}>{state.error}</p>
  if (!state.ok) return null
  return (
    <div className={styles.success}>
      {state.message && <p>{state.message}</p>}
      {state.credentials && (
        /*
          رمز فقط همین یک بار دیده می‌شود. فقط هشش ذخیره شده، پس بعد از رفرش
          هیچ‌کس نمی‌تواند دوباره ببیندش — و این عمدی است.
        */
        <div className={styles.credBox}>
          <strong>اعتبارنامه — همین حالا کپی کنید</strong>
          <dl>
            <dt>یوزرنیم</dt>
            <dd dir="ltr">{state.credentials.username}</dd>
            <dt>رمز</dt>
            <dd dir="ltr">
              <code>{state.credentials.password}</code>
            </dd>
          </dl>
          <p>
            این رمز جای دیگری ذخیره نشده و بعد از بستن این پیام قابل بازیابی نیست.
            کاربر در ورود اول باید عوضش کند.
          </p>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// تایپ props
// ═══════════════════════════════════════════════════════════════════════

export interface AdminData {
  traffic: {
    viewsToday: number
    viewsWeek: number
    viewsMonth: number
    visitorsWeek: number
    botShare: number
    byDevice: { device: string; views: number }[]
    topPaths: { path: string; views: number }[]
    topReferrers: { referrer: string; views: number }[]
  }
  daily: { day: string; views: number; visitors: number }[]
  topPlaces: { id: number; slug: string; name: string; views: number; qualityScore: number }[]
  zeroSearches: { query: string; facetIds: string; count: number }[]
  queue: { pendingReviews: number; pendingSubmissions: number; duplicateSubmissions: number }
  pendingReviews: {
    id: number
    placeSlug: string
    placeName: string
    authorName: string
    stars: number
    text: string | null
  }[]
  submissions: {
    id: number
    name: string
    status: string
    note: string | null
    userName: string | null
    userPhone: string | null
    payload: unknown
  }[]
  health: Record<string, number>
  incomplete: { id: number; slug: string; name: string; qualityScore: number; geoStatus: string }[]
  failedMedia: { id: number; sourceUrl: string; kind: string; error: string | null }[]
  users: {
    id: string
    name: string
    phone: string
    username: string | null
    role: string
    blocked: boolean
    hasPassword: boolean
    mustChangePassword: boolean
    ownedPlaces: { id: number; name: string }[]
  }[]
  userSummary: { total: number; customers: number; owners: number; admins: number; withPassword: number; blocked: number; newThisWeek: number }
  places: { id: number; name: string; slug: string; status: string; qualityScore: number }[]
  configProblems: { key: string; message: string; fatal: boolean }[]
  dbOk: boolean
  mapReady: boolean
  /** تنظیمات سایت — مقدار فعلی، کلیدهای تغییریافته و زمان آخرین تغییر. */
  settings: SettingsPanelProps
}

const DEVICE_LABELS: Record<string, string> = {
  mobile: 'موبایل',
  desktop: 'دسکتاپ',
  tablet: 'تبلت',
  bot: 'ربات',
  unknown: 'نامشخص',
}

const ROLE_LABELS: Record<string, string> = {
  customer: 'کاربر',
  owner: 'مالک کافه',
  admin: 'مدیر',
}

export function AdminDashboard({ data }: { data: AdminData }) {
  const [tab, setTab] = useState<Tab>('queue')
  const [userQuery, setUserQuery] = useState('')

  const [reviewState, reviewAction] = useActionState(moderateReviewAction, EMPTY_ADMIN_STATE)
  const [subState, subAction] = useActionState(reviewSubmissionAction, EMPTY_ADMIN_STATE)
  const [statusState, statusAction] = useActionState(setPlaceStatusAction, EMPTY_ADMIN_STATE)
  const [credState, credAction] = useActionState(setCredentialsAction, EMPTY_ADMIN_STATE)
  const [venueState, venueAction] = useActionState(createVenueAccountAction, EMPTY_ADMIN_STATE)
  const [roleState, roleAction] = useActionState(setUserRoleAction, EMPTY_ADMIN_STATE)
  const [blockState, blockAction] = useActionState(setUserBlockedAction, EMPTY_ADMIN_STATE)
  const [assignState, assignAction] = useActionState(assignPlaceAction, EMPTY_ADMIN_STATE)
  const [viewAsState, viewAsAction] = useActionState(startViewAsAction, EMPTY_ADMIN_STATE)

  const queueCount =
    data.queue.pendingReviews + data.queue.pendingSubmissions + data.queue.duplicateSubmissions

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: 'queue', label: 'صف کار', badge: queueCount },
    { id: 'traffic', label: 'بازدید' },
    { id: 'places', label: 'مجموعه‌ها' },
    { id: 'users', label: 'کاربران' },
    { id: 'credentials', label: 'اعتبارنامه' },
    { id: 'health', label: 'سلامت داده' },
    { id: 'settings', label: 'تنظیمات' },
    { id: 'operations', label: 'عملیات' },
  ]

  const filteredUsers = userQuery.trim()
    ? data.users.filter((user) =>
        `${user.name} ${user.phone} ${user.username ?? ''}`.includes(userQuery.trim()),
      )
    : data.users

  const maxDaily = Math.max(1, ...data.daily.map((point) => point.views))

  return (
    <div className={styles.panel}>
      <header className={styles.head}>
        <div>
          <h1 className={styles.title}>پنل مدیریت</h1>
          <p className={styles.sub}>
            {faCount(data.health.published ?? 0)} مجموعه منتشرشده ·{' '}
            {faCount(data.userSummary.total)} کاربر ·{' '}
            {faCount(data.traffic.viewsWeek)} بازدید این هفته
          </p>
        </div>
        <div className={styles.headActions}>
          <Link href={paths.ownerPanel} className={styles.headLink}>
            پنل کافه
          </Link>
          <Link href={paths.profile} className={styles.headLink}>
            پنل من
          </Link>
        </div>
      </header>

      {/* هشدار تنظیمات — قبل از هر چیز، چون سایت را می‌شکند. */}
      {(data.configProblems.some((problem) => problem.fatal) || !data.dbOk || !data.mapReady) && (
        <div className={styles.warnBox}>
          {!data.dbOk && <p>⚠️ اتصال دیتابیس برقرار نیست.</p>}
          {!data.mapReady && (
            <p>⚠️ داده‌ی نقشه استخراج نشده — نقشه‌ها خالی می‌مانند. (`npm run map:extract`)</p>
          )}
          {data.configProblems
            .filter((problem) => problem.fatal)
            .map((problem) => (
              <p key={problem.key}>
                ⚠️ {problem.key}: {problem.message}
              </p>
            ))}
        </div>
      )}

      <nav className={styles.tabs}>
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            className={tab === item.id ? styles.tabOn : styles.tab}
            onClick={() => setTab(item.id)}
          >
            {item.label}
            {item.badge ? <span className={styles.badge}>{fa(item.badge)}</span> : null}
          </button>
        ))}
      </nav>

      {/* ── صف کار ───────────────────────────────────────────────── */}
      {tab === 'queue' && (
        <section className={styles.section}>
          <Feedback state={reviewState} />
          <Feedback state={subState} />

          <h2 className={styles.h2}>
            نظرهای در انتظار تأیید
            <span className={styles.count}>{fa(data.pendingReviews.length)}</span>
          </h2>
          {data.pendingReviews.length === 0 ? (
            <p className={styles.empty}>صف خالی است.</p>
          ) : (
            <ul className={styles.list}>
              {data.pendingReviews.map((review) => (
                <li key={review.id} className={styles.card}>
                  <div className={styles.cardHead}>
                    <Link href={paths.cafe(review.placeSlug)} target="_blank">
                      {review.placeName}
                    </Link>
                    <span className={styles.stars}>{'★'.repeat(review.stars)}</span>
                    <span className={styles.dim}>{review.authorName}</span>
                  </div>
                  {review.text && <p className={styles.cardText}>{review.text}</p>}
                  <div className={styles.cardActions}>
                    <form action={reviewAction}>
                      <input type="hidden" name="reviewId" value={review.id} />
                      <input type="hidden" name="decision" value="approved" />
                      <Submit label="تأیید و انتشار" />
                    </form>
                    <form action={reviewAction} className={styles.inlineForm}>
                      <input type="hidden" name="reviewId" value={review.id} />
                      <input type="hidden" name="decision" value="rejected" />
                      <input
                        name="reason"
                        className={styles.inlineInput}
                        placeholder="دلیل رد (به کاربر نشان داده می‌شود)"
                      />
                      <Submit label="رد" danger />
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <h2 className={styles.h2}>
            کافه‌های ثبت‌شده توسط کاربران
            <span className={styles.count}>{fa(data.submissions.length)}</span>
          </h2>
          {data.submissions.length === 0 ? (
            <p className={styles.empty}>صف خالی است.</p>
          ) : (
            <ul className={styles.list}>
              {data.submissions.map((submission) => (
                <li key={submission.id} className={styles.card}>
                  <div className={styles.cardHead}>
                    <strong>{submission.name}</strong>
                    {submission.status === 'duplicate' && (
                      <span className={styles.warnBadge}>احتمال تکراری</span>
                    )}
                    <span className={styles.dim}>
                      {submission.userName || 'بی‌نام'}
                      {submission.userPhone ? ` · ${fa(submission.userPhone)}` : ''}
                    </span>
                  </div>
                  {submission.note && <p className={styles.cardText}>{submission.note}</p>}
                  <pre className={styles.payload}>{JSON.stringify(submission.payload, null, 1)}</pre>
                  <div className={styles.cardActions}>
                    <form action={subAction}>
                      <input type="hidden" name="submissionId" value={submission.id} />
                      <input type="hidden" name="decision" value="approved" />
                      <Submit label="تأیید (ساخت پیش‌نویس)" />
                    </form>
                    <form action={subAction} className={styles.inlineForm}>
                      <input type="hidden" name="submissionId" value={submission.id} />
                      <input type="hidden" name="decision" value="rejected" />
                      <input name="reason" className={styles.inlineInput} placeholder="دلیل" />
                      <Submit label="رد" danger />
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ── بازدید ───────────────────────────────────────────────── */}
      {tab === 'traffic' && (
        <section className={styles.section}>
          <div className={styles.statGrid}>
            <div className={styles.stat}>
              <span className={styles.statValue}>{faCount(data.traffic.viewsToday)}</span>
              <span className={styles.statLabel}>بازدید امروز</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statValue}>{faCount(data.traffic.viewsWeek)}</span>
              <span className={styles.statLabel}>۷ روز</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statValue}>{faCount(data.traffic.viewsMonth)}</span>
              <span className={styles.statLabel}>۳۰ روز</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statValue}>{faCount(data.traffic.visitorsWeek)}</span>
              <span className={styles.statLabel}>بازدیدکننده‌ی یکتا (هفته)</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statValue}>
                {fa(Math.round(data.traffic.botShare * 100))}٪
              </span>
              <span className={styles.statLabel}>سهم ربات‌ها</span>
            </div>
          </div>

          {data.daily.length > 0 && (
            <div className={styles.chartBox}>
              <h2 className={styles.h2}>بازدید روزانه</h2>
              {/* نمودار میله‌ای با CSS — بدون کتابخانه‌ی نمودار، چون یک
                  نمودار ساده ارزش ۵۰ کیلوبایت جاوااسکریپت را ندارد. */}
              <div className={styles.chart} role="img" aria-label="نمودار بازدید روزانه">
                {data.daily.map((point) => (
                  <span
                    key={point.day}
                    className={styles.bar}
                    style={{ height: `${Math.max(3, (point.views / maxDaily) * 100)}%` }}
                    title={`${point.day}: ${point.views} بازدید · ${point.visitors} یکتا`}
                  />
                ))}
              </div>
              <p className={styles.dim}>
                بیشینه‌ی روزانه: {faCount(maxDaily)} بازدید
              </p>
            </div>
          )}

          <div className={styles.twoCol}>
            <div>
              <h2 className={styles.h2}>پرترددترین صفحه‌ها</h2>
              <ul className={styles.rows}>
                {data.traffic.topPaths.map((row) => (
                  <li key={row.path}>
                    <span dir="ltr" className={styles.mono}>
                      {row.path}
                    </span>
                    <span>{faCount(row.views)}</span>
                  </li>
                ))}
                {data.traffic.topPaths.length === 0 && <li className={styles.empty}>داده‌ای نیست</li>}
              </ul>
            </div>

            <div>
              <h2 className={styles.h2}>دستگاه</h2>
              <ul className={styles.rows}>
                {data.traffic.byDevice.map((row) => (
                  <li key={row.device}>
                    <span>{DEVICE_LABELS[row.device] ?? row.device}</span>
                    <span>{faCount(row.views)}</span>
                  </li>
                ))}
              </ul>

              <h2 className={styles.h2}>از کجا آمدند</h2>
              <ul className={styles.rows}>
                {data.traffic.topReferrers.map((row) => (
                  <li key={row.referrer}>
                    <span dir="ltr" className={styles.mono}>
                      {row.referrer.slice(0, 40)}
                    </span>
                    <span>{faCount(row.views)}</span>
                  </li>
                ))}
                {data.traffic.topReferrers.length === 0 && (
                  <li className={styles.empty}>همه ورود مستقیم</li>
                )}
              </ul>
            </div>
          </div>

          <h2 className={styles.h2}>پربازدیدترین مجموعه‌ها</h2>
          <ul className={styles.rows}>
            {data.topPlaces.map((place) => (
              <li key={place.id}>
                <Link href={paths.cafe(place.slug)} target="_blank">
                  {place.name}
                </Link>
                <span>{faCount(place.views)}</span>
              </li>
            ))}
            {data.topPlaces.length === 0 && <li className={styles.empty}>هنوز بازدیدی ثبت نشده</li>}
          </ul>

          <div className={styles.insightBox}>
            <h2 className={styles.h2}>جست‌وجوهای بی‌نتیجه</h2>
            <p className={styles.dim}>
              باارزش‌ترین گزارش این پنل: کاربر چه چیزی خواسته که نداریم.
            </p>
            <ul className={styles.rows}>
              {data.zeroSearches.map((row) => (
                <li key={`${row.query}|${row.facetIds}`}>
                  <span>
                    {row.query || '—'}
                    {row.facetIds && <span className={styles.dim}> · {row.facetIds}</span>}
                  </span>
                  <span>{fa(row.count)} بار</span>
                </li>
              ))}
              {data.zeroSearches.length === 0 && (
                <li className={styles.empty}>هر جست‌وجویی نتیجه داشته</li>
              )}
            </ul>
          </div>
        </section>
      )}

      {/* ── مجموعه‌ها ────────────────────────────────────────────── */}
      {tab === 'places' && (
        <section className={styles.section}>
          <Feedback state={statusState} />
          <h2 className={styles.h2}>
            مدیریت مجموعه‌ها
            <span className={styles.count}>{faCount(data.places.length)}</span>
          </h2>
          <p className={styles.dim}>
            برای ویرایش اطلاعات، ساعت و منو، پنل کافه‌ی همان مجموعه را باز کنید.
          </p>
          <ul className={styles.list}>
            {data.places.map((place) => (
              <li key={place.id} className={styles.rowCard}>
                <span className={styles.rowName}>
                  <Link href={paths.cafe(place.slug)} target="_blank">
                    {place.name}
                  </Link>
                  <span className={styles.dim}> · کیفیت {fa(place.qualityScore)}٪</span>
                </span>

                <Link href={`${paths.ownerPanel}?place=${place.id}`} className={styles.btnGhost}>
                  ویرایش
                </Link>

                <form action={statusAction} className={styles.inlineForm}>
                  <input type="hidden" name="placeId" value={place.id} />
                  <select name="status" defaultValue={place.status} className={styles.select}>
                    <option value="published">منتشرشده</option>
                    <option value="draft">پیش‌نویس</option>
                    <option value="temporarily_closed">موقتاً تعطیل</option>
                    <option value="permanently_closed">تعطیل دائم</option>
                  </select>
                  <Submit label="ذخیره" />
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── کاربران ──────────────────────────────────────────────── */}
      {tab === 'users' && (
        <section className={styles.section}>
          <Feedback state={roleState} />
          <Feedback state={blockState} />
          <Feedback state={assignState} />
          <Feedback state={viewAsState} />

          <div className={styles.statGrid}>
            <div className={styles.stat}>
              <span className={styles.statValue}>{faCount(data.userSummary.total)}</span>
              <span className={styles.statLabel}>کل</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statValue}>{faCount(data.userSummary.owners)}</span>
              <span className={styles.statLabel}>مالک کافه</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statValue}>{faCount(data.userSummary.withPassword)}</span>
              <span className={styles.statLabel}>دارای رمز</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statValue}>{faCount(data.userSummary.newThisWeek)}</span>
              <span className={styles.statLabel}>تازه (هفته)</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statValue}>{faCount(data.userSummary.blocked)}</span>
              <span className={styles.statLabel}>مسدود</span>
            </div>
          </div>

          <input
            className={styles.search}
            value={userQuery}
            onChange={(event) => setUserQuery(event.target.value)}
            placeholder="جست‌وجوی نام، شماره یا یوزرنیم"
          />

          <ul className={styles.list}>
            {filteredUsers.map((user) => (
              <li key={user.id} className={styles.card}>
                <div className={styles.cardHead}>
                  <strong>{user.name || 'بی‌نام'}</strong>
                  <span className={styles.dim} dir="ltr">
                    {user.phone ? fa(user.phone) : '—'}
                  </span>
                  {user.username && (
                    <span className={styles.tag} dir="ltr">
                      {user.username}
                    </span>
                  )}
                  <span className={styles.tag}>{ROLE_LABELS[user.role] ?? user.role}</span>
                  {user.blocked && <span className={styles.warnBadge}>مسدود</span>}
                  {user.hasPassword ? (
                    <span className={styles.tag}>رمز دارد</span>
                  ) : (
                    <span className={styles.dim}>بدون رمز</span>
                  )}
                  {user.mustChangePassword && (
                    <span className={styles.warnBadge}>رمز موقت</span>
                  )}
                </div>

                {user.ownedPlaces.length > 0 && (
                  <p className={styles.cardText}>
                    مجموعه‌ها:{' '}
                    {user.ownedPlaces.map((place) => (
                      <span key={place.id} className={styles.tag}>
                        {place.name}
                        <form action={assignAction} className={styles.tagForm}>
                          <input type="hidden" name="userId" value={user.id} />
                          <input type="hidden" name="placeId" value={place.id} />
                          <input type="hidden" name="revoke" value="1" />
                          <button type="submit" title="برداشتن دسترسی">
                            ×
                          </button>
                        </form>
                      </span>
                    ))}
                  </p>
                )}

                <div className={styles.cardActions}>
                  {/* ورود مستقیم به پنل همین کاربر. */}
                  {user.role !== 'admin' && !user.blocked && (
                    <form action={viewAsAction}>
                      <input type="hidden" name="userId" value={user.id} />
                      <Submit label="ورود به پنل او" />
                    </form>
                  )}

                  <form action={roleAction} className={styles.inlineForm}>
                    <input type="hidden" name="userId" value={user.id} />
                    <select name="role" defaultValue={user.role} className={styles.select}>
                      <option value="customer">کاربر</option>
                      <option value="owner">مالک کافه</option>
                      <option value="admin">مدیر</option>
                    </select>
                    <Submit label="نقش" />
                  </form>

                  <form action={blockAction}>
                    <input type="hidden" name="userId" value={user.id} />
                    <input type="hidden" name="blocked" value={user.blocked ? '0' : '1'} />
                    <Submit label={user.blocked ? 'رفع مسدودی' : 'مسدود کردن'} danger={!user.blocked} />
                  </form>

                  <form action={assignAction} className={styles.inlineForm}>
                    <input type="hidden" name="userId" value={user.id} />
                    <select name="placeId" className={styles.select} defaultValue="">
                      <option value="">وصل‌کردن مجموعه…</option>
                      {data.places.map((place) => (
                        <option key={place.id} value={place.id}>
                          {place.name}
                        </option>
                      ))}
                    </select>
                    <Submit label="وصل" />
                  </form>
                </div>
              </li>
            ))}
            {filteredUsers.length === 0 && <li className={styles.empty}>کاربری پیدا نشد.</li>}
          </ul>
        </section>
      )}

      {/* ── اعتبارنامه ───────────────────────────────────────────── */}
      {tab === 'credentials' && (
        <section className={styles.section}>
          <Feedback state={venueState} />
          <Feedback state={credState} />

          <div className={styles.formBox}>
            <h2 className={styles.h2}>ساخت حساب برای یک کافه</h2>
            <p className={styles.dim}>
              حساب، اعتبارنامه و انتساب مجموعه — در یک قدم. اگر شماره از قبل حساب دارد،
              همان حساب مالک این کافه می‌شود.
            </p>
            <form action={venueAction} className={styles.form}>
              <label className={styles.field}>
                <span>مجموعه</span>
                <select name="placeId" className={styles.select} required defaultValue="">
                  <option value="">انتخاب کنید…</option>
                  {data.places.map((place) => (
                    <option key={place.id} value={place.id}>
                      {place.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <span>یوزرنیم</span>
                <input
                  name="username"
                  className={styles.input}
                  dir="ltr"
                  placeholder="shayer_cafe"
                  pattern="[a-zA-Z0-9_.]{3,32}"
                />
              </label>
              <label className={styles.field}>
                <span>شماره موبایل (اختیاری)</span>
                <input name="phone" className={styles.input} dir="ltr" placeholder="09151234567" />
              </label>
              <label className={styles.field}>
                <span>نام نمایشی</span>
                <input name="name" className={styles.input} placeholder="مدیر کافه شایر" />
              </label>
              <label className={styles.field}>
                <span>رمز (خالی = تولید خودکار)</span>
                <input name="password" className={styles.input} dir="ltr" minLength={8} />
              </label>
              <Submit label="ساخت حساب و صدور رمز" />
            </form>
          </div>

          <div className={styles.formBox}>
            <h2 className={styles.h2}>بازنشانی اعتبارنامه‌ی یک حساب موجود</h2>
            <p className={styles.dim}>
              برای کاربر عادی هم کار می‌کند — رمز دائمی می‌گیرد و می‌تواند بدون پیامک
              وارد شود.
            </p>
            <form action={credAction} className={styles.form}>
              <label className={styles.field}>
                <span>حساب</span>
                <select name="userId" className={styles.select} required defaultValue="">
                  <option value="">انتخاب کنید…</option>
                  {data.users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name || 'بی‌نام'} — {user.phone || user.username || user.id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <span>یوزرنیم تازه (اختیاری)</span>
                <input
                  name="username"
                  className={styles.input}
                  dir="ltr"
                  pattern="[a-zA-Z0-9_.]{3,32}"
                />
              </label>
              <label className={styles.field}>
                <span>رمز (خالی = تولید خودکار)</span>
                <input name="password" className={styles.input} dir="ltr" minLength={8} />
              </label>
              <Submit label="صدور رمز" />
            </form>
          </div>
        </section>
      )}

      {/* ── سلامت داده ───────────────────────────────────────────── */}
      {tab === 'health' && (
        <section className={styles.section}>
          <h2 className={styles.h2}>وضعیت داده</h2>
          <p className={styles.dim}>
            هر عدد یک صفِ کار است، نه آمار تزئینی.
          </p>
          <div className={styles.statGrid}>
            {[
              ['کل مجموعه', data.health.total],
              ['منتشرشده', data.health.published],
              ['پیش‌نویس', data.health.draft],
              ['فروشگاه (غیرکافه)', data.health.shops],
              ['بدون مختصات', data.health.noCoords],
              ['بیرون کادر مشهد', data.health.outOfArea],
              ['بدون ساعت کاری', data.health.noHours],
              ['بدون منو', data.health.noMenu],
              ['بدون تلفن', data.health.noPhone],
              ['بدون درباره', data.health.noAbout],
              ['بدون محله', data.health.noDistrict],
              ['قیمت اصلاح‌واحد‌شده', data.health.priceUnitFixed],
              ['تصویر ناموفق', data.health.mediaFailed],
              [`قیمت بیات (>${fa(Number(data.settings.values.stalePriceDays ?? 90))} روز)`, data.health.stalePrices],
            ].map(([label, value]) => (
              <div key={String(label)} className={styles.stat}>
                <span className={styles.statValue}>{faCount(Number(value ?? 0))}</span>
                <span className={styles.statLabel}>{String(label)}</span>
              </div>
            ))}
          </div>

          <h2 className={styles.h2}>ناقص‌ترین پروفایل‌ها</h2>
          <ul className={styles.rows}>
            {data.incomplete.map((place) => (
              <li key={place.id}>
                <Link href={`${paths.ownerPanel}?place=${place.id}`}>{place.name}</Link>
                <span>
                  {fa(place.qualityScore)}٪
                  {place.geoStatus !== 'ok' && <span className={styles.dim}> · بی‌مختصات</span>}
                </span>
              </li>
            ))}
          </ul>

          {data.failedMedia.length > 0 && (
            <>
              <h2 className={styles.h2}>تصویرهای ناموفق</h2>
              <ul className={styles.rows}>
                {data.failedMedia.map((item) => (
                  <li key={item.id}>
                    <span dir="ltr" className={styles.mono}>
                      {item.sourceUrl.slice(-52)}
                    </span>
                    <span>{item.error}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {data.configProblems.length > 0 && (
            <>
              <h2 className={styles.h2}>تنظیمات</h2>
              <ul className={styles.rows}>
                {data.configProblems.map((problem) => (
                  <li key={problem.key}>
                    <span className={problem.fatal ? styles.danger : ''}>{problem.key}</span>
                    <span className={styles.dim}>{problem.message}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {/* ── تنظیمات ──────────────────────────────────────────────── */}
      {tab === 'settings' && (
        <section className={styles.section}>
          <SettingsPanel {...data.settings} />
        </section>
      )}

      {/* ── عملیات ───────────────────────────────────────────────── */}
      {tab === 'operations' && (
        <section className={styles.section}>
          <OperationsPanel />
        </section>
      )}
    </div>
  )
}

export default AdminDashboard
