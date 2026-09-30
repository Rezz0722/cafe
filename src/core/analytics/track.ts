import 'server-only'

/**
 * ثبت بازدید صفحه.
 *
 * ═══ چرا خودمان و نه گوگل آنالیتیکس ═══
 *
 * سه دلیل: گوگل آنالیتیکس در ایران بدون فیلترشکن بار نمی‌شود (پس آمارش
 * ناقص است)، داده‌ی بازدیدِ کافه‌ها باید **داخل** پنل کافه‌دار دیده شود نه در
 * یک داشبورد بیرونی، و «کدام کافه بیشتر دیده شد» یک سیگنال محصولی است که
 * باید در رتبه‌بندی هم استفاده شود.
 *
 * ═══ چه چیزی ذخیره نمی‌شود ═══
 *
 * IP ذخیره نمی‌شود. شمارش «یکتا» با یک کوکیِ بی‌نامِ تصادفی انجام می‌شود که
 * هیچ ارتباطی به هویت ندارد. برای آمارِ یک راهنمای کافه، این کافی است و
 * ذخیره‌ی IP فقط یک بدهیِ حقوقی است.
 */

import { randomUUID } from 'node:crypto'
import { and, eq, sql } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { pageView, place as placeTable } from '@/db/schema'

export const VISITOR_COOKIE = 'cafegard_visitor'

export type Device = 'mobile' | 'tablet' | 'desktop' | 'bot' | 'unknown'

/**
 * تشخیص دستگاه از User-Agent.
 *
 * ربات‌ها **جدا** شمرده می‌شوند نه حذف: اگر حذف شوند، معلوم نمی‌شود چرا
 * ترافیک سرور با آمار بازدید نمی‌خواند. و اگر با آدم‌ها قاطی شوند، آمار
 * بازدید بی‌معنی می‌شود.
 */
export function detectDevice(userAgent: string | null): Device {
  if (!userAgent) return 'unknown'
  const ua = userAgent.toLowerCase()
  if (/bot|crawler|spider|crawl|slurp|bingpreview|headless|curl|wget|python-requests/.test(ua)) {
    return 'bot'
  }
  if (/ipad|tablet|playbook|silk/.test(ua)) return 'tablet'
  if (/mobi|iphone|android|phone/.test(ua)) return 'mobile'
  return 'desktop'
}

export function newVisitorId(): string {
  return randomUUID()
}

export interface TrackInput {
  path: string
  visitorId: string | null
  userId?: string | null
  referrer?: string | null
  userAgent?: string | null
  /** اگر صفحه‌ی یک کافه است، شناسه‌اش — برای شمارنده‌ی همان کافه. */
  placeSlug?: string | null
}

/**
 * یک بازدید را ثبت می‌کند.
 *
 * ربات‌ها ثبت می‌شوند ولی `place.view_count` را بالا نمی‌برند: آن عدد به
 * کافه‌دار نشان داده می‌شود و شمردنِ خزنده‌ی گوگل در آن، عددی می‌سازد که با
 * واقعیت نمی‌خواند.
 */
export interface TrackOptions {
  /** خاموش = هیچ ردیفی نوشته نمی‌شود. */
  enabled?: boolean
  /** روشن = ردیفِ ربات هم نوشته می‌شود. پیش‌فرض: نه. */
  countBots?: boolean
}

export async function trackPageView(
  input: TrackInput,
  options: TrackOptions = {},
): Promise<void> {
  if (options.enabled === false) return

  const device = detectDevice(input.userAgent ?? null)
  /*
    ربات‌ها به‌صورت پیش‌فرض ثبت **نمی‌شوند**. قبلاً ردیفشان نوشته می‌شد و فقط
    از `place.view_count` بیرون می‌ماند؛ نتیجه این بود که جدولِ خام با
    خزنده‌های گوگل پر می‌شد و هر پرس‌وجوی آماری باید `device <> 'bot'` را
    یادش می‌ماند — یک شرط که جا افتادنش خطای خاموش می‌سازد.
  */
  if (device === 'bot' && !options.countBots) return

  const db = getDb()

  let placeId: number | null = null
  if (input.placeSlug) {
    const [row] = await db
      .select({ id: placeTable.id })
      .from(placeTable)
      .where(eq(placeTable.slug, input.placeSlug))
      .limit(1)
    placeId = row?.id ?? null
  }

  await db.insert(pageView).values({
    // مسیر بدون query ذخیره می‌شود: با query، هر ترکیب فیلتر یک «صفحه»ی
    // جدا می‌شد و گزارش پرترددترین صفحات بی‌معنی می‌شد.
    path: input.path.split('?')[0]!.slice(0, 300),
    placeId,
    userId: input.userId ?? null,
    visitorId: input.visitorId,
    referrer: input.referrer?.slice(0, 500) ?? null,
    device,
  })

  if (placeId && device !== 'bot') {
    await db
      .update(placeTable)
      .set({ viewCount: sql`${placeTable.viewCount} + 1` })
      .where(eq(placeTable.id, placeId))
  }
}

/**
 * ثبت جست‌وجو.
 *
 * `result_count = 0` باارزش‌ترین ردیفِ این جدول است: مستقیماً می‌گوید کاربر
 * چه چیزی خواسته که نداریم.
 */
export async function trackSearch(input: {
  query: string
  requestedScope?: 'all' | 'places' | 'items'
  resolvedEntity?: 'places' | 'items'
  resolvedIntent?: string | null
  facetIds: string[]
  dishId?: number | null
  districtId?: string | null
  sort?: string | null
  priceMax?: number | null
  nearMe?: boolean
  resultCount: number
  userId?: string | null
  sessionId?: string | null
}): Promise<void> {
  const db = getDb()
  const { searchLog } = await import('@/db/schema')
  await db.insert(searchLog).values({
    query: input.query.slice(0, 255),
    requestedScope: input.requestedScope ?? 'all',
    resolvedEntity: input.resolvedEntity ?? 'places',
    resolvedIntent: input.resolvedIntent?.slice(0, 80) ?? null,
    facetIds: input.facetIds.join(',').slice(0, 500),
    dishId: input.dishId ?? null,
    districtId: input.districtId ?? null,
    sort: input.sort ?? null,
    priceMax: input.priceMax ?? null,
    nearMe: input.nearMe ?? false,
    resultCount: input.resultCount,
    userId: input.userId ?? null,
    sessionId: input.sessionId ?? null,
  })
}

/**
 * فشرده‌سازی روزانه.
 *
 * `page_view` سریع بزرگ می‌شود و شمردن زنده‌اش نمودار پنل ادمین را کند
 * می‌کند. این تابع اعداد هر روز را در `daily_stat` می‌نویسد.
 *
 * idempotent است — اجرای دوباره برای همان روز، همان اعداد را بازنویسی می‌کند.
 */
export async function rollupDay(day: Date = new Date()): Promise<void> {
  const db = getDb()
  const date = day.toISOString().slice(0, 10)

  await db.execute(sql`
    INSERT INTO daily_stat (day, metric, ref_id, value)
    SELECT DATE(created_at), 'page_views', '', COUNT(*)
    FROM page_view
    WHERE DATE(created_at) = ${date} AND device <> 'bot'
    GROUP BY DATE(created_at)
    ON DUPLICATE KEY UPDATE value = VALUES(value)
  `)

  await db.execute(sql`
    INSERT INTO daily_stat (day, metric, ref_id, value)
    SELECT DATE(created_at), 'unique_visitors', '', COUNT(DISTINCT visitor_id)
    FROM page_view
    WHERE DATE(created_at) = ${date} AND device <> 'bot' AND visitor_id IS NOT NULL
    GROUP BY DATE(created_at)
    ON DUPLICATE KEY UPDATE value = VALUES(value)
  `)

  await db.execute(sql`
    INSERT INTO daily_stat (day, metric, ref_id, value)
    SELECT DATE(created_at), 'searches', '', COUNT(*)
    FROM search_log
    WHERE DATE(created_at) = ${date}
    GROUP BY DATE(created_at)
    ON DUPLICATE KEY UPDATE value = VALUES(value)
  `)
}

/** پاک‌سازی بازدیدهای قدیمی — جدول خام لازم نیست تا ابد بماند. */
export async function purgeOldPageViews(keepDays: number): Promise<void> {
  const db = getDb()
  await db.execute(sql`
    DELETE FROM page_view WHERE created_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ${keepDays} DAY)
  `)
}

export { and }
