import 'server-only'

/**
 * آمار پنل ادمین.
 *
 * ═══ چرا هر عدد اینجا یک تصمیم را پشتیبانی می‌کند ═══
 *
 * هر پرس‌وجوی این فایل باید به یک سؤالِ عملی جواب بدهد، وگرنه یک عددِ
 * تزئینی است که فقط داشبورد را شلوغ می‌کند:
 *
 *   بازدید روزانه       → آیا سایت رشد می‌کند؟
 *   جست‌وجوی بی‌نتیجه    → چه داده‌ای کم داریم؟   ← باارزش‌ترین
 *   پرترددترین کافه‌ها   → کدام صفحه‌ها ارزش کامل‌کردن دارند؟
 *   صف تأیید            → چه کاری روی میز است؟
 *   سلامت داده          → کدام کافه‌ها ناقص‌اند؟
 */

import { and, desc, eq, gte, isNull, sql } from 'drizzle-orm'
import { getSettings } from '@/core/settings/store'
import { getDb } from '@/db/client'
import {
  appUser,
  media as mediaTable,
  pageView,
  place as placeTable,
  placeSubmission,
  review as reviewTable,
  reviewReply,
  searchLog,
} from '@/db/schema'

export interface DayPoint {
  day: string
  views: number
  visitors: number
}

/**
 * بازدید روزانه‌ی N روز اخیر.
 *
 * از جدول خام خوانده می‌شود نه از رول‌آپ: برای ۳۰ روز و این حجم، تفاوتی
 * ندارد و همیشه تازه است. رول‌آپ وقتی لازم می‌شود که جدول به میلیون‌ها ردیف
 * برسد.
 *
 * ربات‌ها حذف می‌شوند — آمارِ قاطی‌شده با خزنده‌ها هیچ تصمیمی را پشتیبانی
 * نمی‌کند.
 */
export async function getDailyViews(days = 30): Promise<DayPoint[]> {
  const db = getDb()
  const rows = await db.execute(sql`
    SELECT
      DATE(created_at) AS day,
      COUNT(*) AS views,
      COUNT(DISTINCT visitor_id) AS visitors
    FROM page_view
    WHERE device <> 'bot' AND created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ${days} DAY)
    GROUP BY DATE(created_at)
    ORDER BY day
  `)
  return (rows[0] as unknown as { day: Date | string; views: number; visitors: number }[]).map(
    (row) => ({
      day: typeof row.day === 'string' ? row.day : row.day.toISOString().slice(0, 10),
      views: Number(row.views),
      visitors: Number(row.visitors),
    }),
  )
}

export interface TrafficSummary {
  viewsToday: number
  viewsWeek: number
  viewsMonth: number
  visitorsWeek: number
  botShare: number
  byDevice: { device: string; views: number }[]
  topPaths: { path: string; views: number }[]
  topReferrers: { referrer: string; views: number }[]
}

export async function getTrafficSummary(): Promise<TrafficSummary> {
  const db = getDb()

  const [totals] = (
    await db.execute(sql`
      SELECT
        SUM(DATE(created_at) = DATE(UTC_TIMESTAMP()) AND device <> 'bot') AS today,
        SUM(created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 7 DAY) AND device <> 'bot') AS week,
        SUM(created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY) AND device <> 'bot') AS month,
        COUNT(DISTINCT CASE
          WHEN created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 7 DAY) AND device <> 'bot'
          THEN visitor_id END) AS visitors_week,
        SUM(device = 'bot') AS bots,
        COUNT(*) AS all_views
      FROM page_view
    `)
  )[0] as unknown as Record<string, number>[]

  const devices = (
    await db.execute(sql`
      SELECT device, COUNT(*) AS views FROM page_view
      WHERE created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY)
      GROUP BY device ORDER BY views DESC
    `)
  )[0] as unknown as { device: string; views: number }[]

  const paths = (
    await db.execute(sql`
      SELECT path, COUNT(*) AS views FROM page_view
      WHERE device <> 'bot' AND created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY)
      GROUP BY path ORDER BY views DESC LIMIT 12
    `)
  )[0] as unknown as { path: string; views: number }[]

  const referrers = (
    await db.execute(sql`
      SELECT referrer, COUNT(*) AS views FROM page_view
      WHERE referrer IS NOT NULL AND device <> 'bot'
        AND created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY)
      GROUP BY referrer ORDER BY views DESC LIMIT 8
    `)
  )[0] as unknown as { referrer: string; views: number }[]

  const allViews = Number(totals?.all_views ?? 0)
  const bots = Number(totals?.bots ?? 0)

  return {
    viewsToday: Number(totals?.today ?? 0),
    viewsWeek: Number(totals?.week ?? 0),
    viewsMonth: Number(totals?.month ?? 0),
    visitorsWeek: Number(totals?.visitors_week ?? 0),
    botShare: allViews > 0 ? bots / allViews : 0,
    byDevice: devices.map((row) => ({ device: row.device, views: Number(row.views) })),
    topPaths: paths.map((row) => ({ path: row.path, views: Number(row.views) })),
    topReferrers: referrers.map((row) => ({
      referrer: row.referrer,
      views: Number(row.views),
    })),
  }
}

export interface TopPlace {
  id: number
  slug: string
  name: string
  views: number
  qualityScore: number
  ratingCount: number
}

export async function getTopPlaces(limit = 12): Promise<TopPlace[]> {
  const db = getDb()
  return db
    .select({
      id: placeTable.id,
      slug: placeTable.slug,
      name: placeTable.name,
      views: placeTable.viewCount,
      qualityScore: placeTable.qualityScore,
      ratingCount: placeTable.ratingCount,
    })
    .from(placeTable)
    .where(sql`${placeTable.viewCount} > 0`)
    .orderBy(desc(placeTable.viewCount))
    .limit(limit)
}

export interface ZeroResultSearch {
  query: string
  facetIds: string
  requestedScope: 'all' | 'places' | 'items'
  resolvedEntity: 'places' | 'items'
  resolvedIntent: string | null
  count: number
  lastAt: Date
}

/**
 * جست‌وجوهایی که نتیجه‌ای نداشتند.
 *
 * باارزش‌ترین گزارش این پنل: مستقیماً می‌گوید کاربر چه چیزی خواسته که
 * نداریم. هر ردیف یا یک کافه‌ی جامانده است یا یک facet که واژگانش کم دارد.
 */
export async function getZeroResultSearches(limit = 20): Promise<ZeroResultSearch[]> {
  const db = getDb()
  const rows = await db
    .select({
      query: searchLog.query,
      facetIds: searchLog.facetIds,
      requestedScope: searchLog.requestedScope,
      resolvedEntity: searchLog.resolvedEntity,
      resolvedIntent: searchLog.resolvedIntent,
      count: sql<number>`COUNT(*)`,
      lastAt: sql<Date>`MAX(created_at)`,
    })
    .from(searchLog)
    .where(and(eq(searchLog.resultCount, 0), sql`${searchLog.query} <> ''`))
    .groupBy(
      searchLog.query,
      searchLog.facetIds,
      searchLog.requestedScope,
      searchLog.resolvedEntity,
      searchLog.resolvedIntent,
    )
    .orderBy(desc(sql`COUNT(*)`))
    .limit(limit)
  return rows.map((row) => ({ ...row, count: Number(row.count) }))
}

export interface ModerationQueue {
  pendingReplies: number
  pendingReviews: number
  pendingSubmissions: number
  duplicateSubmissions: number
}

export async function getModerationQueue(): Promise<ModerationQueue> {
  const db = getDb()
  const [row] = await db
    .select({
      pendingReviews: sql<number>`(SELECT COUNT(*) FROM review WHERE status = 'pending')`,
      pendingReplies: sql<number>`(SELECT COUNT(*) FROM review_reply WHERE status = 'pending')`,
      pendingSubmissions: sql<number>`(SELECT COUNT(*) FROM place_submission WHERE status = 'pending')`,
      duplicateSubmissions: sql<number>`(SELECT COUNT(*) FROM place_submission WHERE status = 'duplicate')`,
    })
    .from(sql`(SELECT 1) AS one`)
  return {
    pendingReviews: Number(row?.pendingReviews ?? 0),
    pendingReplies: Number(row?.pendingReplies ?? 0),
    pendingSubmissions: Number(row?.pendingSubmissions ?? 0),
    duplicateSubmissions: Number(row?.duplicateSubmissions ?? 0),
  }
}

export async function listPendingReplies(limit = 40) {
  return getDb().select({ id: reviewReply.id, text: reviewReply.text, reviewText: reviewTable.text, placeSlug: placeTable.slug, placeName: placeTable.name })
    .from(reviewReply).innerJoin(reviewTable, eq(reviewTable.id, reviewReply.reviewId)).innerJoin(placeTable, eq(placeTable.id, reviewTable.placeId))
    .where(eq(reviewReply.status, 'pending')).orderBy(desc(reviewReply.createdAt), desc(reviewReply.id)).limit(limit)
}

export interface DataHealth
  extends Record<
    | 'total'
    | 'published'
    | 'draft'
    | 'shops'
    | 'noCoords'
    | 'outOfArea'
    | 'noHours'
    | 'noMenu'
    | 'noPhone'
    | 'noAbout'
    | 'noDistrict'
    | 'priceUnitFixed'
    | 'mediaFailed'
    | 'stalePrices',
    number
  > {}

/**
 * سلامت داده — فهرست کارِ تیم داده.
 *
 * هر عدد یک صفِ کار است، نه یک آمارِ تزئینی: «۷۳ کافه بی‌مختصات» یعنی ۷۳
 * کافه روی نقشه نیستند و در «نزدیک من» دیده نمی‌شوند.
 */
export async function getDataHealth(): Promise<DataHealth> {
  const db = getDb()
  // «چند روز قیمت بیات است» یک تصمیم سلیقه‌ای است، پس از تنظیمات می‌آید.
  const { stalePriceDays } = await getSettings()
  const [row] = (
    await db.execute(sql`
      SELECT
        (SELECT COUNT(*) FROM place) AS total,
        (SELECT COUNT(*) FROM place WHERE status = 'published') AS published,
        (SELECT COUNT(*) FROM place WHERE status = 'draft') AS draft,
        (SELECT COUNT(*) FROM place WHERE kind = 'shop') AS shops,
        (SELECT COUNT(*) FROM place WHERE geo_status = 'missing') AS no_coords,
        (SELECT COUNT(*) FROM place WHERE geo_status = 'out_of_area') AS out_of_area,
        (SELECT COUNT(*) FROM place p WHERE NOT EXISTS
          (SELECT 1 FROM place_hours h WHERE h.place_id = p.id AND h.closed=0)) AS no_hours,
        (SELECT COUNT(*) FROM place p WHERE NOT EXISTS
          (SELECT 1 FROM menu_item m JOIN menu_section ms ON ms.id=m.section_id WHERE m.place_id = p.id AND m.archived_at IS NULL AND ms.branch_scope IN ('shared','branch'))) AS no_menu,
        (SELECT COUNT(*) FROM place p WHERE NOT EXISTS
          (SELECT 1 FROM place_phone ph WHERE ph.place_id = p.id)) AS no_phone,
        (SELECT COUNT(*) FROM place WHERE about IS NULL OR TRIM(about) = '') AS no_about,
        (SELECT COUNT(*) FROM place WHERE district_id IS NULL) AS no_district,
        (SELECT COUNT(*) FROM place WHERE price_unit_fixed = 1) AS price_unit_fixed,
        (SELECT COUNT(*) FROM media WHERE status = 'failed') AS media_failed,
        (SELECT COUNT(DISTINCT mi.place_id) FROM menu_item mi JOIN menu_section ms ON ms.id=mi.section_id WHERE mi.archived_at IS NULL AND ms.branch_scope IN ('shared','branch') AND mi.price IS NOT NULL AND
          (mi.price_updated_at IS NULL OR
            mi.price_updated_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ${stalePriceDays} DAY))
        ) AS stale_prices
    `)
  )[0] as unknown as Record<string, number>[]

  const n = (key: string) => Number(row?.[key] ?? 0)
  return {
    total: n('total'),
    published: n('published'),
    draft: n('draft'),
    shops: n('shops'),
    noCoords: n('no_coords'),
    outOfArea: n('out_of_area'),
    noHours: n('no_hours'),
    noMenu: n('no_menu'),
    noPhone: n('no_phone'),
    noAbout: n('no_about'),
    noDistrict: n('no_district'),
    priceUnitFixed: n('price_unit_fixed'),
    mediaFailed: n('media_failed'),
    stalePrices: n('stale_prices'),
  }
}

export interface UserSummary {
  total: number
  customers: number
  owners: number
  admins: number
  withPassword: number
  blocked: number
  newThisWeek: number
}

export async function getUserSummary(): Promise<UserSummary> {
  const db = getDb()
  const [row] = await db
    .select({
      total: sql<number>`COUNT(*)`,
      customers: sql<number>`SUM(role = 'customer')`,
      owners: sql<number>`SUM(role = 'owner')`,
      admins: sql<number>`SUM(role = 'admin')`,
      withPassword: sql<number>`SUM(password_hash IS NOT NULL)`,
      blocked: sql<number>`SUM(status = 'blocked')`,
      newThisWeek: sql<number>`SUM(created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 7 DAY))`,
    })
    .from(appUser)

  const n = (value: unknown) => Number(value ?? 0)
  return {
    total: n(row?.total),
    customers: n(row?.customers),
    owners: n(row?.owners),
    admins: n(row?.admins),
    withPassword: n(row?.withPassword),
    blocked: n(row?.blocked),
    newThisWeek: n(row?.newThisWeek),
  }
}

/** رسانه‌های ناموفق — برای دیدن اینکه کدام تصویرها ۴۰۴ شدند. */
export async function getFailedMedia(limit = 20) {
  const db = getDb()
  return db
    .select({
      id: mediaTable.id,
      sourceUrl: mediaTable.sourceUrl,
      kind: mediaTable.kind,
      error: mediaTable.error,
    })
    .from(mediaTable)
    .where(eq(mediaTable.status, 'failed'))
    .limit(limit)
}

/** مکان‌های ناقص — برای صف کار تیم داده. */
export async function listIncompletePlaces(limit = 30) {
  const db = getDb()
  return db
    .select({
      id: placeTable.id,
      slug: placeTable.slug,
      name: placeTable.name,
      qualityScore: placeTable.qualityScore,
      geoStatus: placeTable.geoStatus,
      status: placeTable.status,
    })
    .from(placeTable)
    .where(eq(placeTable.status, 'published'))
    .orderBy(placeTable.qualityScore)
    .limit(limit)
}

// ═══════════════════════════════════════════════════════════════════════
// صف تأیید
// ═══════════════════════════════════════════════════════════════════════

export async function listPendingReviews(limit = 40) {
  const db = getDb()
  return db
    .select({
      id: reviewTable.id,
      placeId: reviewTable.placeId,
      placeSlug: placeTable.slug,
      placeName: placeTable.name,
      authorName: reviewTable.authorName,
      stars: reviewTable.stars,
      text: reviewTable.text,
      createdAt: reviewTable.createdAt,
    })
    .from(reviewTable)
    .innerJoin(placeTable, eq(placeTable.id, reviewTable.placeId))
    .where(eq(reviewTable.status, 'pending'))
    .orderBy(desc(reviewTable.createdAt))
    .limit(limit)
}

export async function listPendingSubmissions(limit = 40) {
  const db = getDb()
  return db
    .select({
      id: placeSubmission.id,
      name: placeSubmission.name,
      payload: placeSubmission.payload,
      status: placeSubmission.status,
      note: placeSubmission.note,
      createdAt: placeSubmission.createdAt,
      userName: appUser.name,
      userPhone: appUser.phone,
    })
    .from(placeSubmission)
    .leftJoin(appUser, eq(appUser.id, placeSubmission.userId))
    .where(sql`${placeSubmission.status} IN ('pending', 'duplicate')`)
    .orderBy(desc(placeSubmission.createdAt))
    .limit(limit)
}

export { gte, isNull }
