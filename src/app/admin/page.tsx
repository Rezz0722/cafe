import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AdminDashboard, type AdminData } from '@/components/admin/AdminDashboard'
import {
  getDailyViews,
  getDataHealth,
  getFailedMedia,
  getModerationQueue,
  getTopPlaces,
  getTrafficSummary,
  getUserSummary,
  listIncompletePlaces,
  listPendingReviews,
  listPendingReplies,
  listPendingSubmissions,
} from '@/core/analytics/stats'
import { getSession } from '@/core/auth/currentUser'
import { findUserById, listUsers } from '@/core/auth/userRepo'
import { checkConfig } from '@/core/config/env'
import { isMapPublished } from '@/core/map/published'
import { listDistricts, listPlaceCards } from '@/core/places/queries'
import { listPendingSuggestions } from '@/core/places/suggestions'
import { getSettings, getSettingsUpdatedAt, listOverriddenKeys } from '@/core/settings/store'
import { pingDb } from '@/db/client'
import { readTopMenuSyncSummary } from '@/core/sync/topMenuSync'
import { authUrl, paths } from '@/routes'
import { getAdminPlaces, getAdminPlaceChoices } from '@/core/admin/catalog'

/**
 * پنل مدیریت.
 *
 * ═══ چرا همه‌ی داده در یک صفحه خوانده می‌شود ═══
 *
 * داده‌های سبک تب‌ها از قبل آمده تا تعویض تب فوری باشد. گزارش تجمیعی
 * جست‌وجوی بی‌نتیجه روی لاگ بزرگ، جداگانه و فقط در تب بازدید خوانده می‌شود؛
 * بازکردن پنل و انجام عملیات نباید منتظر اسکن کل سابقهٔ جست‌وجو بماند.
 */

export const metadata: Metadata = {
  // نام سایت را قالبِ `layout` اضافه می‌کند و آن از تنظیمات می‌آید.
  title: 'پنل مدیریت',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const { user, actor } = await getSession()
  if (!user) redirect(authUrl(paths.admin))
  /*
    در حالت «مشاهده به‌عنوان»، `user` همان کاربرِ هدف است نه ادمین — پس این
    شرط خودبه‌خود پنل ادمین را در آن حالت می‌بندد. نوارِ بالای صفحه راه
    برگشت را می‌دهد.
  */
  if (user.role !== 'admin') redirect(paths.profile)
  void actor

  const signedInAccount = await findUserById(user.id)
  if (signedInAccount?.mustChangePassword) redirect(paths.changePassword)

  const [
    traffic,
    daily,
    topPlaces,
    queue,
    pendingReviews,
    pendingReplies,
    submissions,
    suggestions,
    health,
    incomplete,
    failedMedia,
    users,
    userSummary,
    places,
    placeChoices,
    db,
    settings,
    overriddenKeys,
    settingsUpdatedAt,
    districts,
    topMenuSync,
  ] = await Promise.all([
    getTrafficSummary(),
    getDailyViews(30),
    getTopPlaces(12),
    getModerationQueue(),
    listPendingReviews(40),
    listPendingReplies(40),
    listPendingSubmissions(40),
    listPendingSuggestions(40),
    getDataHealth(),
    listIncompletePlaces(25),
    getFailedMedia(15),
    listUsers({ limit: 25 }),
    getUserSummary(),
    getAdminPlaces(),
    getAdminPlaceChoices(),
    pingDb(),
    getSettings(),
    listOverriddenKeys(),
    getSettingsUpdatedAt(),
    listDistricts(),
    readTopMenuSyncSummary(),
  ])

  const data: AdminData = {
    traffic,
    daily,
    topPlaces: topPlaces.map((place) => ({
      id: place.id,
      slug: place.slug,
      name: place.name,
      views: place.views,
      qualityScore: place.qualityScore,
    })),
    queue,
    pendingReplies,
    pendingReviews: pendingReviews.map((review) => ({
      id: review.id,
      placeSlug: review.placeSlug,
      placeName: review.placeName,
      authorName: review.authorName,
      stars: review.stars,
      text: review.text,
    })),
    submissions: submissions.map((submission) => ({
      id: submission.id,
      name: submission.name,
      status: submission.status,
      note: submission.note,
      userName: submission.userName,
      userPhone: submission.userPhone,
      payload: submission.payload,
    })),
    suggestions: suggestions.map((suggestion) => ({
      id: suggestion.id,
      placeName: suggestion.placeName,
      placeSlug: suggestion.placeSlug,
      fieldLabel: suggestion.fieldLabel,
      currentValue: suggestion.currentValue,
      suggestedValue: suggestion.suggestedValue,
      userName: suggestion.userName,
      userPhone: suggestion.userPhone,
    })),
    health: health as unknown as Record<string, number>,
    incomplete,
    failedMedia,
    users: users.map((account) => ({
      id: account.id,
      name: account.name,
      phone: account.phone,
      username: account.username,
      role: account.role,
      blocked: !!account.blocked,
      // خودِ هش هرگز به کلاینت نمی‌رود — فقط «رمز دارد یا نه».
      hasPassword: !!account.passwordHash,
      mustChangePassword: account.mustChangePassword,
      ownedPlaces: account.ownedPlaces.map((place) => ({ id: place.id, name: place.name })),
      isBlogger: account.isBlogger,
    })),
    userSummary,
    placesTotal: places.total,
    placeOptions: placeChoices,
    places: places.rows.map((place) => ({
      id: place.id,
      name: place.name,
      slug: place.slug,
      status: place.status,
      qualityScore: place.qualityScore,
      archived: place.archived,
    })),
    districts: districts.map((district) => ({ id: district.id, name: district.name })),
    topMenuSync,
    configProblems: checkConfig(),
    dbOk: db.ok,
    mapReady: isMapPublished(),
    settings: {
      // `Settings` تایپِ بسته‌ای دارد؛ پنل با کلید رشته‌ای کار می‌کند.
      values: settings as unknown as Record<string, string | number | boolean>,
      overriddenKeys,
      // تاریخ در سرور به رشته تبدیل می‌شود: فرستادن `Date` به کامپوننت
      // کلاینت یعنی سریال‌سازی، و قالبِ نمایش باید یک‌جا تعیین شود.
      updatedAt: settingsUpdatedAt
        ? new Intl.DateTimeFormat('fa-IR', {
            dateStyle: 'medium',
            timeStyle: 'short',
            timeZone: settings.timeZone,
          }).format(settingsUpdatedAt)
        : null,
    },
  }

  return <AdminDashboard data={data} />
}
