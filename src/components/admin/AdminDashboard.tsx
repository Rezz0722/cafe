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

import { useState } from 'react'
import { usePanelTab } from '@/components/admin/usePanelTab'
import { useAdminCatalog } from '@/components/admin/useAdminCatalog'
import { CatalogPagination } from '@/components/admin/CatalogPagination'
import { AuditHistory } from '@/components/admin/AuditHistory'
import { ManagedForm, useManagedActionState, useManagedFormStatus, useUnsavedForms } from '@/components/admin/ManagedForm'
import Link from 'next/link'
import {
  assignPlaceAction,
  createPlaceAction,
  createVenueAccountAction,
  deletePlaceAction,
  archivePlaceAction,
  restorePlaceAction,
  moderateReviewAction,
  moderateReplyAction,
  reviewSubmissionAction,
  reviewSuggestionAction,
  setCredentialsAction,
  setPlaceStatusAction,
  setUserBlockedAction,
  setBloggerAccessAction,
  setUserRoleAction,
  startViewAsAction,
} from '@/app/admin/actions'
import { EMPTY_ADMIN_STATE, type AdminActionState } from '@/app/admin/state'
import { OperationsPanel } from '@/components/admin/OperationsPanel'
import { ZeroResultInsights } from '@/components/admin/ZeroResultInsights'
import { Stars } from '@/components/ui/Stars'
import { SettingsPanel, type SettingsPanelProps } from '@/components/admin/SettingsPanel'
import { fa, faCount } from '@/lib/format'
import { paths } from '@/routes'
import styles from './AdminDashboard.module.css'
import { TriangleAlert, X } from 'lucide-react'
import type { TopMenuSyncState } from '@/core/sync/topMenuSync'

type Tab =
  | 'queue'
  | 'traffic'
  | 'places'
  | 'users'
  | 'credentials'
  | 'health'
  | 'settings'
  | 'operations'
  | 'history'

function Submit({ label, danger }: { label: string; danger?: boolean }) {
  const { pending } = useManagedFormStatus()
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
  queue: { pendingReviews: number; pendingReplies: number; pendingSubmissions: number; duplicateSubmissions: number }
  pendingReplies: { id: number; text: string; reviewText: string | null; placeSlug: string; placeName: string }[]
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
  /** اصلاح‌هایی که کاربران روی صفحه‌ی کافه‌ها فرستاده‌اند — بخش «مشارکت». */
  suggestions: {
    id: number
    placeName: string
    placeSlug: string
    fieldLabel: string
    currentValue: string | null
    suggestedValue: string
    userName: string | null
    userPhone: string | null
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
    isBlogger: boolean
  }[]
  userSummary: { total: number; customers: number; owners: number; admins: number; withPassword: number; blocked: number; newThisWeek: number }
  places: { id: number; name: string; slug: string; status: string; qualityScore: number; archived?: boolean }[]
  placesTotal: number
  placeOptions: { id: number; name: string }[]
  districts: { id: string; name: string }[]
  topMenuSync: TopMenuSyncState
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
  const draft = useUnsavedForms()
  const [tab, setTab] = usePanelTab<Tab>(['queue', 'traffic', 'places', 'users', 'credentials', 'health', 'settings', 'operations', 'history'], 'queue', draft.confirmDiscard)
  const usersCatalog = useAdminCatalog('users', data.users, data.userSummary.total, (tab === 'users' || tab === 'credentials'))
  const placesCatalog = useAdminCatalog('places', data.places, data.placesTotal, tab === 'places')
  const { query: userQuery, setQuery: setUserQuery } = usersCatalog
  const { query: placeQuery, setQuery: setPlaceQuery } = placesCatalog

  const [reviewState, reviewAction] = useManagedActionState(moderateReviewAction, EMPTY_ADMIN_STATE)
  const [replyModerationState, replyModerationAction] = useManagedActionState(moderateReplyAction, EMPTY_ADMIN_STATE)
  const [subState, subAction] = useManagedActionState(reviewSubmissionAction, EMPTY_ADMIN_STATE)
  const [sugState, sugAction] = useManagedActionState(reviewSuggestionAction, EMPTY_ADMIN_STATE)
  const [statusState, statusAction] = useManagedActionState(setPlaceStatusAction, EMPTY_ADMIN_STATE)
  const [createPlaceState, createPlaceSubmit] = useManagedActionState(createPlaceAction, EMPTY_ADMIN_STATE)
  const [archiveState,archiveSubmit]=useManagedActionState(archivePlaceAction,EMPTY_ADMIN_STATE)
  const [restoreState,restoreSubmit]=useManagedActionState(restorePlaceAction,EMPTY_ADMIN_STATE)
  const [deletePlaceState, deletePlaceSubmit] = useManagedActionState(deletePlaceAction, EMPTY_ADMIN_STATE)
  const [credState, credAction] = useManagedActionState(setCredentialsAction, EMPTY_ADMIN_STATE)
  const [venueState, venueAction] = useManagedActionState(createVenueAccountAction, EMPTY_ADMIN_STATE)
  const [roleState, roleAction] = useManagedActionState(setUserRoleAction, EMPTY_ADMIN_STATE)
  const [bloggerState, bloggerAction] = useManagedActionState(setBloggerAccessAction, EMPTY_ADMIN_STATE)
  const [blockState, blockAction] = useManagedActionState(setUserBlockedAction, EMPTY_ADMIN_STATE)
  const [assignState, assignAction] = useManagedActionState(assignPlaceAction, EMPTY_ADMIN_STATE)
  const [viewAsState, viewAsAction] = useManagedActionState(startViewAsAction, EMPTY_ADMIN_STATE)

  const queueCount =
    data.queue.pendingReviews + data.queue.pendingReplies +
    data.queue.pendingSubmissions +
    data.queue.duplicateSubmissions +
    data.suggestions.length

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: 'queue', label: 'صف کار', badge: queueCount },
    { id: 'traffic', label: 'بازدید' },
    { id: 'places', label: 'مجموعه‌ها' },
    { id: 'users', label: 'کاربران' },
    { id: 'credentials', label: 'اعتبارنامه' },
    { id: 'health', label: 'سلامت داده' },
    { id: 'settings', label: 'تنظیمات' },
    { id: 'operations', label: 'عملیات' },
    { id:'history',label:'تاریخچه'},
  ]

  const filteredUsers = usersCatalog.rows
  const filteredPlaces = placesCatalog.rows

  const maxDaily = Math.max(1, ...data.daily.map((point) => point.views))

  return (
    <div className={styles.panel} ref={draft.root} onInputCapture={draft.mark} onChangeCapture={draft.mark} onClickCapture={draft.guardLink}>
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
          <Link href="/admin/leads" className={styles.headLink}>درخواست‌های پنل</Link>
          <Link href={paths.adminExperiences} className={styles.headLink}>
            پوشش تجربه‌ها
          </Link>
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
          {!data.dbOk && (
            <p>
              <TriangleAlert size={15} aria-hidden="true" /> اتصال دیتابیس برقرار نیست.
            </p>
          )}
          {!data.mapReady && (
            <p>
              <TriangleAlert size={15} aria-hidden="true" /> داده‌ی نقشه استخراج نشده — نقشه‌ها
              خالی می‌مانند. (`npm run map:extract`)
            </p>
          )}
          {data.configProblems
            .filter((problem) => problem.fatal)
            .map((problem) => (
              <p key={problem.key}>
                <TriangleAlert size={15} aria-hidden="true" /> {problem.key}: {problem.message}
              </p>
            ))}
        </div>
      )}

      <nav className={styles.tabs} data-panel-tabs aria-label="بخش‌های مدیریت سایت">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            className={tab === item.id ? styles.tabOn : styles.tab}
            aria-pressed={tab === item.id}
            onClick={() => { if (draft.confirmDiscard()) setTab(item.id) }}
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
          <Feedback state={sugState} />

          {/*
            اصلاح‌های کاربران اول صف است، چون ارزانی‌ترین کارِ صف است و
            مستقیم روی داده‌ی غلطِ صفحه‌ی عمومی اثر می‌گذارد. نظر و کافه‌ی جدید
            صبر می‌کنند؛ ساعت کاریِ غلط هر روز کاربر را به درِ بسته می‌فرستد.
          */}
          <h2 className={styles.h2}>
            اصلاح‌های فرستاده‌ی کاربران
            <span className={styles.count}>{fa(data.suggestions.length)}</span>
          </h2>
          {data.suggestions.length === 0 ? (
            <p className={styles.empty}>صف خالی است.</p>
          ) : (
            <ul className={styles.list}>
              {data.suggestions.map((suggestion) => (
                <li key={suggestion.id} className={styles.card}>
                  <div className={styles.cardHead}>
                    <Link href={paths.cafe(suggestion.placeSlug)} target="_blank">
                      {suggestion.placeName}
                    </Link>
                    <span className={styles.warnBadge}>{suggestion.fieldLabel}</span>
                    <span className={styles.dim}>
                      {suggestion.userName || 'بی‌نام'}
                      {suggestion.userPhone ? ` · ${fa(suggestion.userPhone)}` : ''}
                    </span>
                  </div>

                  {/* «از → به» کنار هم، وگرنه ادمین باید صفحه را باز کند و
                      خودش مقایسه کند. */}
                  {suggestion.currentValue && (
                    <p className={styles.cardText}>
                      <span className={styles.dim}>الان: </span>
                      {suggestion.currentValue}
                    </p>
                  )}
                  <p className={styles.cardText}>
                    <strong>پیشنهاد: </strong>
                    {suggestion.suggestedValue}
                  </p>

                  <div className={styles.cardActions}>
                    <ManagedForm action={sugAction}>
                      <input type="hidden" name="suggestionId" value={suggestion.id} />
                      <input type="hidden" name="decision" value="applied" />
                      <Submit label="اعمال کردم — ببند" />
                    </ManagedForm>
                    <ManagedForm action={sugAction}>
                      <input type="hidden" name="suggestionId" value={suggestion.id} />
                      <input type="hidden" name="decision" value="rejected" />
                      <Submit label="رد" danger />
                    </ManagedForm>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <h2 className={styles.h2}>پاسخ‌های کافه‌دار در انتظار تأیید <span className={styles.count}>{fa(data.pendingReplies.length)}</span></h2>
          <Feedback state={replyModerationState} />
          {!data.pendingReplies.length ? <p className={styles.empty}>پاسخی در انتظار بررسی نیست.</p> : <ul className={styles.list}>
            {data.pendingReplies.map(reply => <li key={reply.id} className={styles.card}>
              <Link href={paths.cafe(reply.placeSlug)} target="_blank">{reply.placeName}</Link>
              {reply.reviewText && <p className={styles.dim}>نظر مشتری: {reply.reviewText}</p>}
              <p className={styles.cardText}>{reply.text}</p>
              <ManagedForm action={replyModerationAction} className={styles.inlineForm}>
                <input type="hidden" name="replyId" value={reply.id} />
                <button className={styles.btn} name="decision" value="approved">تأیید و انتشار</button>
                <button className={styles.btnDanger} name="decision" value="rejected">رد پاسخ</button>
              </ManagedForm>
            </li>)}
          </ul>}
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
                    <Stars count={review.stars} size={13} />
                    <span className={styles.dim}>{review.authorName}</span>
                  </div>
                  {review.text && <p className={styles.cardText}>{review.text}</p>}
                  <div className={styles.cardActions}>
                    <ManagedForm action={reviewAction}>
                      <input type="hidden" name="reviewId" value={review.id} />
                      <input type="hidden" name="decision" value="approved" />
                      <Submit label="تأیید و انتشار" />
                    </ManagedForm>
                    <ManagedForm action={reviewAction} className={styles.inlineForm}>
                      <input type="hidden" name="reviewId" value={review.id} />
                      <input type="hidden" name="decision" value="rejected" />
                      <input
                        name="reason"
                        className={styles.inlineInput}
                        placeholder="دلیل رد (به کاربر نشان داده می‌شود)"
                      />
                      <Submit label="رد" danger />
                    </ManagedForm>
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
                    <ManagedForm action={subAction}>
                      <input type="hidden" name="submissionId" value={submission.id} />
                      <input type="hidden" name="decision" value="approved" />
                      <Submit label="تأیید (ساخت پیش‌نویس)" />
                    </ManagedForm>
                    <ManagedForm action={subAction} className={styles.inlineForm}>
                      <input type="hidden" name="submissionId" value={submission.id} />
                      <input type="hidden" name="decision" value="rejected" />
                      <input name="reason" className={styles.inlineInput} placeholder="دلیل" />
                      <Submit label="رد" danger />
                    </ManagedForm>
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

          <ZeroResultInsights />
        </section>
      )}

      {/* ── مجموعه‌ها ────────────────────────────────────────────── */}
      {tab === 'places' && (
        <section className={styles.section}>
          <Feedback state={statusState} />
          <Feedback state={createPlaceState} />
          <Feedback state={deletePlaceState} /><Feedback state={archiveState}/><Feedback state={restoreState}/>
          <h2 className={styles.h2}>
            مدیریت مجموعه‌ها
            <span className={styles.count}>{faCount(placesCatalog.total)}</span>
          </h2>
          <p className={styles.dim}>
            برای ویرایش اطلاعات، ساعت و منو، پنل کافه‌ی همان مجموعه را باز کنید.
          </p>

          <details className={styles.adminCreate}>
            <summary>افزودن کافه یا مجموعهٔ جدید</summary>
            <ManagedForm action={createPlaceSubmit} className={styles.form}>
              <div className={styles.formGrid}>
                <label className={styles.field}><span>نام مجموعه *</span><input name="name" className={styles.input} required maxLength={200} /></label>
                <label className={styles.field}><span>نوع</span><select name="kind" className={styles.select} defaultValue="cafe"><option value="cafe">کافه</option><option value="cafe_restaurant">کافه‌رستوران</option><option value="restaurant">رستوران</option><option value="bakery">نانوایی/بیکری</option><option value="lounge">لانژ</option><option value="shop">فروشگاه</option></select></label>
                <label className={styles.field}><span>وضعیت اولیه</span><select name="status" className={styles.select} defaultValue="draft"><option value="draft">پیش‌نویس (پیشنهادی)</option><option value="published">انتشار فوری</option></select></label>
                <label className={styles.field}><span>محله</span><select name="districtId" className={styles.select} defaultValue=""><option value="">ثبت‌نشده</option>{data.districts.map((district) => <option key={district.id} value={district.id}>{district.name}</option>)}</select></label>
                <label className={styles.fieldWide}><span>آدرس</span><input name="address" className={styles.input} maxLength={500} /></label>
                <label className={styles.field}><span>اینستاگرام</span><input name="instagram" className={styles.input} dir="ltr" placeholder="cafe_name" /></label>
                <label className={styles.field}><span>عرض جغرافیایی</span><input name="lat" className={styles.input} dir="ltr" inputMode="decimal" /></label>
                <label className={styles.field}><span>طول جغرافیایی</span><input name="lng" className={styles.input} dir="ltr" inputMode="decimal" /></label>
              </div>
              <Submit label="ساخت مجموعه" />
            </ManagedForm>
          </details>

          <label className={styles.field}><span>جست‌وجوی مجموعه</span><input className={styles.search} maxLength={120} value={placeQuery} onChange={(event) => { if (draft.confirmDiscard()) setPlaceQuery(event.target.value) }} placeholder="نام کافه یا آدرس صفحه" /></label>
          <div className={styles.catalogFilters}>
            <label>وضعیت<select className={styles.select} value={placesCatalog.filters.status ?? ''} onChange={event => { if (draft.confirmDiscard()) placesCatalog.setFilter('status', event.target.value) }}><option value="">همه وضعیت‌ها</option><option value="published">منتشرشده</option><option value="draft">پیش‌نویس</option><option value="temporarily_closed">تعطیل موقت</option><option value="permanently_closed">تعطیل دائم</option></select></label>
            <label>محله<select className={styles.select} value={placesCatalog.filters.district ?? ''} onChange={event => { if (draft.confirmDiscard()) placesCatalog.setFilter('district', event.target.value) }}><option value="">همه محله‌ها</option>{data.districts.map(district => <option key={district.id} value={district.id}>{district.name}</option>)}</select></label>
            <label>نیاز به اقدام<select className={styles.select} value={placesCatalog.filters.health ?? ''} onChange={event => { if (draft.confirmDiscard()) placesCatalog.setFilter('health', event.target.value) }}><option value="">همه مجموعه‌های فعال</option><option value="no_coords">بدون موقعیت</option><option value="out_of_area">بیرون کادر مشهد</option><option value="shops">فروشگاه</option><option value="price_unit_fixed">قیمت اصلاح‌واحدشده</option><option value="no_hours">بدون ساعت کاری</option><option value="no_menu">بدون منو</option><option value="no_phone">بدون تماس</option><option value="no_about">بدون توضیح</option><option value="no_district">بدون محله</option><option value="stale_price">قیمت قدیمی</option><option value="archived">آرشیو قابل بازیابی</option></select></label>
          </div>
          <ul className={styles.list}>
            {filteredPlaces.map((place) => (
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

                {!place.archived && <ManagedForm action={statusAction} className={styles.inlineForm}>
                  <input type="hidden" name="placeId" value={place.id} />
                  <select name="status" aria-label={`وضعیت ${place.name}`} defaultValue={place.status} className={styles.select}>
                    <option value="published">منتشرشده</option>
                    <option value="draft">پیش‌نویس</option>
                    <option value="temporarily_closed">موقتاً تعطیل</option>
                    <option value="permanently_closed">تعطیل دائم</option>
                  </select>
                  <Submit label="ذخیره" />
                </ManagedForm>}
                <ManagedForm action={place.archived?restoreSubmit:archiveSubmit} className={styles.inlineForm} onSubmit={event=>{if(!window.confirm(place.archived?'کافه با وضعیت پیش از آرشیو بازیابی شود؟':'کافه از سایت عمومی پنهان شود؟ داده‌ها حفظ می‌شوند و قابل بازیابی‌اند.'))event.preventDefault()}}><input type="hidden" name="placeId" value={place.id}/><Submit label={place.archived?'بازیابی کافه':'آرشیو'}/></ManagedForm>
                {place.archived && (
                  <details className={styles.dangerDetails}>
                    <summary>حذف دائمی (پس از ۷ روز آرشیو)</summary>
                    <ManagedForm action={deletePlaceSubmit} className={styles.deleteForm} onSubmit={(event) => { if (!window.confirm(`«${place.name}» و تمام منو و داده‌های وابسته برای همیشه حذف شود؟`)) event.preventDefault() }}>
                      <input type="hidden" name="placeId" value={place.id} />
                      <p>فقط پس از دوره بازیابی ۷ روزه مجاز است؛ این کار بازگشت‌پذیر نیست. نام مجموعه و عبارت «حذف دائمی» را وارد کنید.</p>
                      <input name="confirmName" className={styles.input} placeholder={place.name} required />
                      <input name="confirmPhrase" className={styles.input} placeholder="حذف دائمی" required />
                      <Submit label="حذف دائمی" danger />
                    </ManagedForm>
                  </details>
                )}
              </li>
            ))}
            {filteredPlaces.length === 0 && <li className={styles.empty}>مجموعه‌ای پیدا نشد.</li>}
          </ul>
          <CatalogPagination {...placesCatalog} setPage={page => { if (draft.confirmDiscard()) placesCatalog.setPage(page) }} />
        </section>
      )}

      {/* ── کاربران ──────────────────────────────────────────────── */}
      {tab === 'users' && (
        <section className={styles.section}>
          <Feedback state={roleState} />
          <Feedback state={bloggerState} />
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
            onChange={(event) => { if (draft.confirmDiscard()) setUserQuery(event.target.value) }}
            placeholder="جست‌وجوی نام، شماره یا یوزرنیم"
            aria-label="جست‌وجوی کاربران" maxLength={120}
          />

          <label className={styles.field}><span>نقش کاربر</span><select className={styles.select} value={usersCatalog.filters.role ?? ''} onChange={event => { if (draft.confirmDiscard()) usersCatalog.setFilter('role', event.target.value) }}><option value="">همه نقش‌ها</option><option value="admin">مدیر سیستم</option><option value="owner">مالک کافه</option><option value="customer">کاربر عادی</option></select></label>
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
                        <ManagedForm action={assignAction} className={styles.tagForm}>
                          <input type="hidden" name="userId" value={user.id} />
                          <input type="hidden" name="placeId" value={place.id} />
                          <input type="hidden" name="revoke" value="1" />
                          <button type="submit" title="برداشتن دسترسی">
                            <X size={16} aria-hidden="true" />
                          </button>
                        </ManagedForm>
                      </span>
                    ))}
                  </p>
                )}

                <div className={styles.cardActions}>
                  {/* ورود مستقیم به پنل همین کاربر. */}
                  {user.role !== 'admin' && !user.blocked && (
                    <ManagedForm action={viewAsAction}>
                      <input type="hidden" name="userId" value={user.id} />
                      <Submit label="ورود به پنل او" />
                    </ManagedForm>
                  )}

                  <ManagedForm action={roleAction} className={styles.inlineForm}>
                    <input type="hidden" name="userId" value={user.id} />
                    <select name="role" defaultValue={user.role} className={styles.select}>
                      <option value="customer">کاربر</option>
                      <option value="owner">مالک کافه</option>
                      <option value="admin">مدیر</option>
                    </select>
                    <Submit label="نقش" />
                  </ManagedForm>

                  <ManagedForm action={bloggerAction}>
                    <input type="hidden" name="userId" value={user.id} />
                    <input type="hidden" name="enabled" value={user.isBlogger ? '0' : '1'} />
                    <Submit label={user.isBlogger ? 'حذف دسترسی بلاگر' : 'تأیید به‌عنوان بلاگر'} />
                  </ManagedForm>

                  <ManagedForm action={blockAction}>
                    <input type="hidden" name="userId" value={user.id} />
                    <input type="hidden" name="blocked" value={user.blocked ? '0' : '1'} />
                    <Submit label={user.blocked ? 'رفع مسدودی' : 'مسدود کردن'} danger={!user.blocked} />
                  </ManagedForm>

                  <ManagedForm action={assignAction} className={styles.inlineForm}>
                    <input type="hidden" name="userId" value={user.id} />
                    <select name="placeId" className={styles.select} defaultValue="">
                      <option value="">وصل‌کردن مجموعه…</option>
                      {data.placeOptions.map((place) => (
                        <option key={place.id} value={place.id}>
                          {place.name}
                        </option>
                      ))}
                    </select>
                    <Submit label="وصل" />
                  </ManagedForm>
                </div>
              </li>
            ))}
            {filteredUsers.length === 0 && <li className={styles.empty}>کاربری پیدا نشد.</li>}
          </ul>
          <CatalogPagination {...usersCatalog} setPage={page => { if (draft.confirmDiscard()) usersCatalog.setPage(page) }} />
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
            <ManagedForm action={venueAction} className={styles.form}>
              <label className={styles.field}>
                <span>مجموعه</span>
                <select name="placeId" className={styles.select} required defaultValue="">
                  <option value="">انتخاب کنید…</option>
                  {data.placeOptions.map((place) => (
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
            </ManagedForm>
          </div>

          <div className={styles.formBox}>
            <h2 className={styles.h2}>بازنشانی اعتبارنامه‌ی یک حساب موجود</h2>
            <p className={styles.dim}>
              برای کاربر عادی هم کار می‌کند — رمز دائمی می‌گیرد و می‌تواند بدون پیامک
              وارد شود.
            </p>
            <label className={styles.field}><span>پیداکردن حساب برای بازنشانی</span><input type="search" className={styles.search} value={userQuery} maxLength={120} onChange={event => { if (draft.confirmDiscard()) setUserQuery(event.target.value) }} placeholder="نام، شماره یا نام کاربری" /></label>
            <CatalogPagination {...usersCatalog} setPage={page => { if (draft.confirmDiscard()) usersCatalog.setPage(page) }} />
            <ManagedForm action={credAction} className={styles.form}>
              <label className={styles.field}>
                <span>حساب</span>
                <select name="userId" className={styles.select} required defaultValue="">
                  <option value="">انتخاب کنید…</option>
                  {usersCatalog.rows.map((user) => (
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
            </ManagedForm>
          </div>
        </section>
      )}

      {/* ── سلامت داده ───────────────────────────────────────────── */}
      {tab === 'health' && (
        <section className={styles.section}>
          <h2 className={styles.h2}>وضعیت داده</h2>
          <p className={styles.dim}>
            عددهای قابل‌کلیک، فهرست مجموعه‌های نیازمند اقدام را باز می‌کنند. «قیمت بیات» تعداد مجموعه‌هاست؛ «تصویر ناموفق» تعداد فایل‌هاست.
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
              <button type="button" key={String(label)} className={styles.stat} onClick={()=>{
                if(String(label)==='تصویر ناموفق'){document.getElementById('failed-media-list')?.scrollIntoView({behavior:'smooth',block:'start'});return}
                if(!draft.confirmDiscard())return
                placesCatalog.setFilter('district','')
                const health:Record<string,string>={'فروشگاه (غیرکافه)':'shops','بیرون کادر مشهد':'out_of_area','قیمت اصلاح‌واحد‌شده':'price_unit_fixed','بدون مختصات':'no_coords','بدون ساعت کاری':'no_hours','بدون منو':'no_menu','بدون تلفن':'no_phone','بدون درباره':'no_about','بدون محله':'no_district'}
                const filter=health[String(label)]??(String(label).startsWith('قیمت بیات')?'stale_price':'')
                placesCatalog.setFilter('health',filter);placesCatalog.setFilter('status',label==='منتشرشده'?'published':label==='پیش‌نویس'?'draft':'');setTab('places')
              }} style={{textAlign:'start',cursor:'pointer',font:'inherit'}}>
                <span className={styles.statValue}>{faCount(Number(value ?? 0))}</span>
                <span className={styles.statLabel}>{String(label)}</span>
              </button>
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
              <h2 id="failed-media-list" className={styles.h2} style={{scrollMarginTop:100}}>تصویرهای ناموفق</h2>
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
      {tab === 'history' && <AuditHistory/>}
      {tab === 'operations' && (
        <section className={styles.section}>
          <OperationsPanel topMenuSync={data.topMenuSync} />
        </section>
      )}
    </div>
  )
}

export default AdminDashboard
