import 'server-only'

/**
 * پرس‌وجوهای خواندنِ مکان از MySQL.
 *
 * ═══ چرا این فایل جای `repository.ts` قدیمی را می‌گیرد ═══
 *
 * لایه‌ی قبلی همه‌ی مکان‌ها را از یک فایل JSON می‌خواند و در حافظه فیلتر
 * می‌کرد. با ۳۳۱ مکان و **۱۹٬۳۸۶ آیتم منو** این دیگر ممکن نیست: خواندن کل
 * منوی شهر برای رندر یک صفحه‌ی فهرست، هم حافظه را می‌خورد و هم هر درخواست را
 * کند می‌کند. فیلتر و مرتب‌سازی کارِ دیتابیس است.
 *
 * ═══ دو شکل خروجی، عمداً ═══
 *
 *   PlaceCard    سبک — چیزی که در فهرست، نقشه و جست‌وجو لازم است
 *   PlaceDetail  سنگین — کل منو، ساعت، تماس؛ فقط در صفحه‌ی یک کافه
 *
 * یکی‌کردنشان یعنی صفحه‌ی فهرست هم منو را بار کند. جداکردنشان یعنی صفحه‌ی
 * فهرست ۱۰ برابر سریع‌تر است.
 */

import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  lte,
  ne,
  or,
  sql,
  type SQL,
} from 'drizzle-orm'
import { getDb } from '@/db/client'
import {
  dish as dishTable,
  district as districtTable,
  facet as facetTable,
  media as mediaTable,
  menuItem as menuItemTable,
  menuSection as menuSectionTable,
  place as placeTable,
  placeAttribute as placeAttributeTable,
  placeDish as placeDishTable,
  placeFacet as placeFacetTable,
  placeHours as placeHoursTable,
  placePhone as placePhoneTable,
  placeSocial as placeSocialTable,
  review as reviewTable,
} from '@/db/schema'
import { mediaFullUrl, mediaPublicUrl } from '@/core/media/store'
import { bayesianAverage } from '@/core/rating/bayesian'
import { getDiscoveryPolicy } from '@/core/settings/policies'

// ═══════════════════════════════════════════════════════════════════════
// شکل خروجی
// ═══════════════════════════════════════════════════════════════════════

export interface Coords {
  lat: number
  lng: number
}

export interface MediaRef {
  /** نسخه‌ی کارت — ۴۰۰px */
  url: string
  /** نسخه‌ی بزرگ — ۱۰۰۰px، برای lightbox */
  fullUrl: string
  width: number | null
  height: number | null
}

export interface PlaceCard {
  id: number
  slug: string
  name: string
  nameEn: string | null
  kind: string
  status: string
  coords: Coords | null
  geoStatus: string
  address: string
  districtId: string | null
  /** slug محله برای ساخت لینک — با `id` یکسان نیست (`faramarz` → `faramarz-abbasi`). */
  districtSlug: string | null
  districtName: string | null
  priceTier: number
  priceMedian: number | null
  ribbon: string | null
  signatureItem: string | null
  logo: MediaRef | null
  ratingCount: number
  /** میانگین بیزی — نه میانگین خام. */
  rating: number
  qualityScore: number
  /** شناسه‌ی facetهای این مکان — برای نمایش chip بدون پرس‌وجوی دوم. */
  facetIds: string[]
}

export interface MenuItemView {
  id: number
  name: string
  nameEn: string | null
  description: string | null
  price: number | null
  priceUnknown: boolean
  available: boolean
  featured: boolean
  image: MediaRef | null
  dishId: number | null
}

export interface MenuSectionView {
  id: number
  name: string
  description: string | null
  facetId: string | null
  image: MediaRef | null
  items: MenuItemView[]
}

export interface HourShift {
  dow: number
  shiftIndex: number
  opensAt: string | null
  closesAt: string | null
  crossesMidnight: boolean
  closed: boolean
}

export interface PhoneView {
  phone: string
  kind: string
}

export interface SocialView {
  kind: string
  label: string | null
  url: string
  handle: string | null
}

export interface PlaceDetail extends PlaceCard {
  about: string | null
  menuUrl: string | null
  instagram: string | null
  priceMin: number | null
  priceMax: number | null
  priceUnitFixed: boolean
  phones: PhoneView[]
  socials: SocialView[]
  hours: HourShift[]
  menu: MenuSectionView[]
  /** تعداد آیتم و بازه‌ی قیمت — برای نمایش خلاصه بدون شمردن در UI. */
  menuItemCount: number
  lastVerifiedAt: Date | null
  updatedAt: Date
}

// ═══════════════════════════════════════════════════════════════════════
// کمکی‌ها
// ═══════════════════════════════════════════════════════════════════════

/**
 * `DECIMAL` از درایور رشته می‌آید (عمدی — جلوی از دست رفتن دقت را می‌گیرد).
 * تبدیل فقط همین‌جا انجام می‌شود تا در کل اپ یک شکل داشته باشیم.
 */
function toCoords(lat: string | null, lng: string | null): Coords | null {
  if (lat === null || lng === null) return null
  const latNum = Number(lat)
  const lngNum = Number(lng)
  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) return null
  return { lat: latNum, lng: lngNum }
}

function toMediaRef(
  localPath: string | null,
  width: number | null,
  height: number | null,
): MediaRef | null {
  const url = mediaPublicUrl(localPath)
  const fullUrl = mediaFullUrl(localPath)
  if (!url || !fullUrl) return null
  return { url, fullUrl, width, height }
}

/** `TIME` از MySQL به‌شکل `HH:MM:SS` می‌آید؛ UI ثانیه نمی‌خواهد. */
function toClock(value: string | null): string | null {
  if (!value) return null
  return value.slice(0, 5)
}

// ═══════════════════════════════════════════════════════════════════════
// میانگین امتیاز سایت — پایه‌ی رتبه‌بندی بیزی
// ═══════════════════════════════════════════════════════════════════════

let siteMeanCache: { value: number; at: number } | null = null
const SITE_MEAN_TTL_MS = 60_000

/**
 * میانگین امتیاز کل سایت.
 *
 * کش یک‌دقیقه‌ای دارد چون در هر رندرِ فهرست لازم است ولی تقریباً هرگز عوض
 * نمی‌شود. بدون کش، هر صفحه یک `AVG` روی جدول نظرها می‌زند.
 */
async function getSiteMean(): Promise<number> {
  const { defaultSiteMean } = await getDiscoveryPolicy()
  const now = Date.now()
  if (siteMeanCache && now - siteMeanCache.at < SITE_MEAN_TTL_MS)
    return siteMeanCache.value

  const db = getDb()
  const [row] = await db
    .select({
      sum: sql<number>`COALESCE(SUM(rating_sum), 0)`,
      count: sql<number>`COALESCE(SUM(rating_count), 0)`,
    })
    .from(placeTable)

  const value =
    row && Number(row.count) > 0 ? Number(row.sum) / Number(row.count) : defaultSiteMean
  siteMeanCache = { value, at: now }
  return value
}

/** بعد از ثبت یا تأیید نظر صدا زده می‌شود تا میانگین بیات نماند. */
export function invalidateSiteMean(): void {
  siteMeanCache = null
}

// ═══════════════════════════════════════════════════════════════════════
// کش داده‌ی مرجع
// ═══════════════════════════════════════════════════════════════════════

/**
 * کشِ داده‌ی مرجع (facet، دیش، محله، آمار سایت).
 *
 * ═══ چرا لازم است ═══
 *
 * Next.js `generateMetadata` و خودِ کامپوننت صفحه را **جدا** اجرا می‌کند، پس
 * هر صفحه‌ی جست‌وجو این پرس‌وجوها را دو بار می‌زند. این داده فقط با ایمپورت یا
 * ویرایش در پنل عوض می‌شود، پس کش کردنش بی‌خطر است.
 *
 * ═══ چرا TTL از ۶۰ ثانیه به ۱۵ دقیقه رفت ═══
 *
 * TTL کوتاه برای این بود که «بعد از ایمپورت لازم نباشد سرور ری‌استارت شود» —
 * ولی آن نگرانی از وقتی که `invalidateReferenceCache()` به اکشن‌های پنل وصل
 * شد بی‌مورد است: هر تغییرِ واقعی خودش کش را می‌ریزد.
 *
 * هزینه‌ی TTL کوتاه اندازه‌گیری شد: `listDistricts` سرد **۸۳۶ میلی‌ثانیه** بود
 * (زیرپرس‌وجوی همبسته به‌ازای هر محله) و `getSiteStats` ۲۸۷ میلی‌ثانیه. با
 * ۶۰ ثانیه، هر دقیقه یک بازدیدکننده این جریمه را می‌پرداخت — و زیر PM2 با چند
 * worker، هر worker جداگانه.
 *
 * ⚠️ این کش **درون‌فرآیندی** است. زیر PM2 در حالت `cluster` با چند instance،
 * `invalidateReferenceCache()` فقط کشِ همان worker را می‌ریزد و بقیه تا پایان
 * TTL داده‌ی بیات می‌دهند. `ecosystem.config.js` عمداً `fork` با یک instance
 * است؛ دلیلش همان‌جا نوشته شده.
 */
const REFERENCE_TTL_MS = Number(process.env.REFERENCE_CACHE_TTL_MS ?? 15 * 60_000)

interface CacheEntry<T> {
  value: T
  at: number
}

const referenceCache = new Map<string, CacheEntry<unknown>>()

async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = referenceCache.get(key)
  if (hit && Date.now() - hit.at < REFERENCE_TTL_MS) return hit.value as T
  const value = await load()
  referenceCache.set(key, { value, at: Date.now() })
  return value
}

/** بعد از ایمپورت یا تغییر واژگان صدا زده می‌شود. */
export function invalidateReferenceCache(): void {
  referenceCache.clear()
}

// ═══════════════════════════════════════════════════════════════════════
// فهرست
// ═══════════════════════════════════════════════════════════════════════

export interface ListFilters {
  /** فقط منتشرشده‌ها. پیش‌فرض true — پنل ادمین می‌تواند خاموشش کند. */
  publishedOnly?: boolean
  districtId?: string | null
  /** شناسه‌ی facet — مکان باید **همه‌ی** آن‌ها را داشته باشد. */
  facetIds?: string[]
  /**
   * شناسه‌ی ویژگی — «مناسب کار»، «فضای باز». مکان باید **همه‌ی** آن‌ها را
   * داشته باشد، مثل facet.
   *
   * جدا از `facetIds` است چون منشأشان فرق دارد و اسکیما هم جدایشان کرده:
   * facet از منوی واقعی استخراج می‌شود، ویژگی را آدم ثبت می‌کند.
   */
  attributeIds?: string[]
  /** شناسه‌ی دیش — «کجا پاستا دارد». */
  dishId?: number | null
  priceTiers?: number[]
  /** سقف قیمت مورد نظر کاربر، به تومان — روی میانه‌ی منو اعمال می‌شود. */
  maxPrice?: number | null
  /** فقط مکان‌هایی که مختصات معتبر دارند (برای نقشه و «نزدیک من»). */
  mappableOnly?: boolean
  /** جست‌وجوی متنی روی نام مکان. */
  query?: string | null
  limit?: number
  offset?: number
  sort?: 'rating' | 'quality' | 'price_asc' | 'price_desc' | 'name'
}

const DEFAULT_LIMIT = 60

/**
 * شرط‌های WHERE از فیلترها.
 *
 * ═══ چرا مشترک است ═══
 *
 * `listPlaceCards` و `countPlaces` **باید** دقیقاً یک شرط بسازند. وقتی جدا
 * بودند، `countPlaces` فیلتر متن، facet، دیش و قیمت را نادیده می‌گرفت و
 * نتیجه‌اش این بود: صفحه ۲۴ کارت نشان می‌داد و زیرش می‌نوشت «۳۲۶ مجموعه»، و
 * صفحه‌بندی هم از عددِ غلط ساخته می‌شد.
 *
 * این باگ در تست جست‌وجوی تولیدی پیدا شد.
 */
function buildPlaceConditions(filters: ListFilters): SQL[] {
  const {
    publishedOnly = true,
    districtId,
    facetIds = [],
    attributeIds = [],
    dishId,
    priceTiers,
    maxPrice,
    mappableOnly,
    query,
  } = filters

  const conditions: SQL[] = []

  if (publishedOnly) conditions.push(eq(placeTable.status, 'published') as SQL)
  if (districtId) conditions.push(eq(placeTable.districtId, districtId) as SQL)
  if (priceTiers?.length)
    conditions.push(inArray(placeTable.priceTier, priceTiers) as SQL)
  if (maxPrice) {
    // مکانِ بی‌قیمت حذف نمی‌شود: نبودِ قیمت یعنی «نمی‌دانیم»، نه «گران است».
    conditions.push(
      or(
        lte(placeTable.priceMedian, maxPrice),
        sql`${placeTable.priceMedian} IS NULL`,
      ) as SQL,
    )
  }
  if (mappableOnly) {
    conditions.push(eq(placeTable.geoStatus, 'ok') as SQL)
    conditions.push(isNotNull(placeTable.lat) as SQL)
  }
  if (query?.trim()) {
    const term = query.trim()
    conditions.push(
      sql`MATCH(${placeTable.name}, ${placeTable.nameNormalized}) AGAINST (${term} IN NATURAL LANGUAGE MODE)`,
    )
  }

  /*
    facet و dish با زیرپرس‌وجو فیلتر می‌شوند نه join: با join، مکانی که دو
    facet دارد دو بار در نتیجه می‌آید و `HAVING COUNT` لازم می‌شود.

    ⚠️ ارجاع به ستونِ پرس‌وجوی بیرونی **صریح و با نام جدول** نوشته می‌شود
    (`place.id`)، نه با درج شیء ستون drizzle. drizzle در این موقعیت نام جدول
    را حذف می‌کند و `` `id` `` تولید می‌کند؛ MySQL آن را به جدولِ درونی نسبت
    می‌دهد و شرط بی‌صدا اشتباه می‌شود.
  */
  if (facetIds.length > 0) {
    conditions.push(
      sql`(SELECT COUNT(DISTINCT pf.facet_id) FROM place_facet pf WHERE pf.place_id = place.id AND pf.facet_id IN ${facetIds}) = ${facetIds.length}`,
    )
  }
  /*
    ویژگی‌ها همان الگوی facet را دارند، با یک تفاوت: `value`.

    `place_attribute.value` سه‌حالته است (۰ نه · ۱ تاحدی · ۲ بله) و اینجا
    `>= 1` قبول می‌شود. یعنی «تاحدی مناسب کار» در نتیجه‌ی فیلترِ «مناسب کار»
    می‌آید. سخت‌گیری روی `= 2` نتیجه را به مکان‌هایی محدود می‌کرد که کسی
    قطعیتِ کامل ثبت کرده باشد، و ردیف‌های `۰` هم — که صریحاً «نه» یعنی —
    باید بیرون بمانند، پس شرط نمی‌تواند فقط «وجود ردیف» باشد.
  */
  if (attributeIds.length > 0) {
    conditions.push(
      sql`(SELECT COUNT(DISTINCT pa.attribute_id) FROM place_attribute pa WHERE pa.place_id = place.id AND pa.attribute_id IN ${attributeIds} AND pa.value >= 1) = ${attributeIds.length}`,
    )
  }
  if (dishId) {
    conditions.push(
      sql`EXISTS (SELECT 1 FROM place_dish pd WHERE pd.place_id = place.id AND pd.dish_id = ${dishId})`,
    )
  }

  return conditions
}

/**
 * فهرست کارت‌ها با فیلتر.
 *
 * مرتب‌سازی «نزدیک‌ترین» اینجا نیست: فاصله به موقعیت کاربر بستگی دارد که
 * سمت سرور نداریم. لایه‌ی بالاتر (`sortByDistance`) بعد از گرفتن کارت‌ها
 * مرتب می‌کند. برای ۳۳۱ مکان این کاملاً بی‌هزینه است.
 */
export async function listPlaceCards(filters: ListFilters = {}): Promise<PlaceCard[]> {
  const db = getDb()
  const { limit = DEFAULT_LIMIT, offset = 0, sort = 'rating' } = filters
  const conditions = buildPlaceConditions(filters)

  // میانگین بیزی **در SQL** حساب می‌شود، نه بعد از گرفتن نتایج: مرتب‌سازی در
  // حافظه فقط صفحه‌ی جاری را مرتب می‌کند و با `LIMIT` نتیجه‌ی غلط می‌دهد.
  // فرمول همان `bayesianAverage` است تا عددِ سورت و عددِ نمایش یکی باشد.
  const [siteMean, { ratingPriorCount }] = await Promise.all([getSiteMean(), getDiscoveryPolicy()])
  const bayesian = sql`
    (${placeTable.ratingCount} / (${placeTable.ratingCount} + ${ratingPriorCount}))
      * (${placeTable.ratingSum} / GREATEST(${placeTable.ratingCount}, 1))
    + (${ratingPriorCount} / (${placeTable.ratingCount} + ${ratingPriorCount})) * ${siteMean}
  `

  const orderBy = {
    rating: [desc(bayesian), desc(placeTable.qualityScore)],
    quality: [desc(placeTable.qualityScore), asc(placeTable.name)],
    // مکانِ بی‌قیمت آخر می‌آید، نه اول: «نمی‌دانیم» ارزان‌ترین نیست.
    price_asc: [asc(sql`COALESCE(${placeTable.priceMedian}, 999999999)`)],
    price_desc: [desc(sql`COALESCE(${placeTable.priceMedian}, 0)`)],
    name: [asc(placeTable.name)],
  }[sort]

  const rows = await db
    .select({
      id: placeTable.id,
      slug: placeTable.slug,
      name: placeTable.name,
      nameEn: placeTable.nameEn,
      kind: placeTable.kind,
      status: placeTable.status,
      lat: placeTable.lat,
      lng: placeTable.lng,
      geoStatus: placeTable.geoStatus,
      address: placeTable.address,
      districtId: placeTable.districtId,
      districtSlug: districtTable.slug,
      districtName: districtTable.name,
      priceTier: placeTable.priceTier,
      priceMedian: placeTable.priceMedian,
      ribbon: placeTable.ribbon,
      signatureItem: placeTable.signatureItem,
      ratingSum: placeTable.ratingSum,
      ratingCount: placeTable.ratingCount,
      qualityScore: placeTable.qualityScore,
      logoPath: mediaTable.localPath,
      logoWidth: mediaTable.width,
      logoHeight: mediaTable.height,
    })
    .from(placeTable)
    .leftJoin(districtTable, eq(districtTable.id, placeTable.districtId))
    .leftJoin(mediaTable, eq(mediaTable.id, placeTable.logoMediaId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(...orderBy)
    .limit(limit)
    .offset(offset)

  if (rows.length === 0) return []

  const facetMap = await loadFacetIds(rows.map((row) => row.id))

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    nameEn: row.nameEn,
    kind: row.kind,
    status: row.status,
    coords: toCoords(row.lat, row.lng),
    geoStatus: row.geoStatus,
    address: row.address,
    districtId: row.districtId,
    districtSlug: row.districtSlug,
    districtName: row.districtName,
    priceTier: row.priceTier,
    priceMedian: row.priceMedian,
    ribbon: row.ribbon,
    signatureItem: row.signatureItem,
    logo: toMediaRef(row.logoPath, row.logoWidth, row.logoHeight),
    ratingCount: row.ratingCount,
    rating: bayesianAverage(row.ratingSum, row.ratingCount, siteMean, ratingPriorCount),
    qualityScore: row.qualityScore,
    facetIds: facetMap.get(row.id) ?? [],
  }))
}

/** facetهای چند مکان در یک پرس‌وجو — جلوگیری از N+1. */
async function loadFacetIds(placeIds: number[]): Promise<Map<number, string[]>> {
  const out = new Map<number, string[]>()
  if (placeIds.length === 0) return out
  const db = getDb()
  const rows = await db
    .select({
      placeId: placeFacetTable.placeId,
      facetId: placeFacetTable.facetId,
    })
    .from(placeFacetTable)
    .where(inArray(placeFacetTable.placeId, placeIds))
  for (const row of rows) {
    const list = out.get(row.placeId)
    if (list) list.push(row.facetId)
    else out.set(row.placeId, [row.facetId])
  }
  return out
}

/**
 * تعداد نتایج — با **همان** شرط‌های `listPlaceCards`.
 *
 * از `buildPlaceConditions` استفاده می‌کند تا هیچ‌وقت از هم نیفتند. قبلاً جدا
 * بودند و شمارش، فیلتر متن و facet و قیمت را نادیده می‌گرفت.
 */
export async function countPlaces(filters: ListFilters = {}): Promise<number> {
  const db = getDb()
  const conditions = buildPlaceConditions(filters)
  const [row] = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(placeTable)
    .where(conditions.length ? and(...conditions) : undefined)
  return Number(row?.n ?? 0)
}

// ═══════════════════════════════════════════════════════════════════════
// جزئیات
// ═══════════════════════════════════════════════════════════════════════

/**
 * یک مکان با کل منو، ساعت و تماس.
 *
 * پنج پرس‌وجوی موازی می‌زند نه یک join بزرگ: join کردن مکان با ۲۸۷ آیتم منو و
 * ۱۴ شیفت ساعت و ۳ تلفن، حاصل‌ضرب دکارتی می‌سازد (۲۸۷×۱۴×۳ ردیف) و همان داده
 * را ده‌ها بار تکرار می‌کند.
 */
export async function getPlaceDetail(
  slug: string,
  options: { includeUnpublished?: boolean } = {},
): Promise<PlaceDetail | null> {
  const db = getDb()

  const conditions = [eq(placeTable.slug, slug)]
  if (!options.includeUnpublished) conditions.push(ne(placeTable.status, 'draft'))

  const [row] = await db
    .select({
      id: placeTable.id,
      slug: placeTable.slug,
      name: placeTable.name,
      nameEn: placeTable.nameEn,
      kind: placeTable.kind,
      status: placeTable.status,
      lat: placeTable.lat,
      lng: placeTable.lng,
      geoStatus: placeTable.geoStatus,
      address: placeTable.address,
      districtId: placeTable.districtId,
      districtSlug: districtTable.slug,
      districtName: districtTable.name,
      priceTier: placeTable.priceTier,
      priceMin: placeTable.priceMin,
      priceMedian: placeTable.priceMedian,
      priceMax: placeTable.priceMax,
      priceUnitFixed: placeTable.priceUnitFixed,
      ribbon: placeTable.ribbon,
      signatureItem: placeTable.signatureItem,
      about: placeTable.about,
      menuUrl: placeTable.menuUrl,
      instagram: placeTable.instagram,
      ratingSum: placeTable.ratingSum,
      ratingCount: placeTable.ratingCount,
      qualityScore: placeTable.qualityScore,
      logoPath: mediaTable.localPath,
      logoWidth: mediaTable.width,
      logoHeight: mediaTable.height,
      lastVerifiedAt: placeTable.lastVerifiedAt,
      updatedAt: placeTable.updatedAt,
    })
    .from(placeTable)
    .leftJoin(districtTable, eq(districtTable.id, placeTable.districtId))
    .leftJoin(mediaTable, eq(mediaTable.id, placeTable.logoMediaId))
    .where(and(...conditions))
    .limit(1)

  if (!row) return null

  const [phones, socials, hours, sections, items, facets, siteMean, discovery] = await Promise.all([
    db
      .select({ phone: placePhoneTable.phone, kind: placePhoneTable.kind })
      .from(placePhoneTable)
      .where(eq(placePhoneTable.placeId, row.id))
      .orderBy(asc(placePhoneTable.sortOrder)),
    db
      .select({
        kind: placeSocialTable.kind,
        label: placeSocialTable.label,
        url: placeSocialTable.url,
        handle: placeSocialTable.handle,
      })
      .from(placeSocialTable)
      .where(eq(placeSocialTable.placeId, row.id)),
    db
      .select()
      .from(placeHoursTable)
      .where(eq(placeHoursTable.placeId, row.id))
      .orderBy(asc(placeHoursTable.dow), asc(placeHoursTable.shiftIndex)),
    db
      .select({
        id: menuSectionTable.id,
        name: menuSectionTable.name,
        description: menuSectionTable.description,
        facetId: menuSectionTable.facetId,
        mediaPath: mediaTable.localPath,
        mediaWidth: mediaTable.width,
        mediaHeight: mediaTable.height,
      })
      .from(menuSectionTable)
      .leftJoin(mediaTable, eq(mediaTable.id, menuSectionTable.mediaId))
      .where(eq(menuSectionTable.placeId, row.id))
      .orderBy(asc(menuSectionTable.sortOrder)),
    db
      .select({
        id: menuItemTable.id,
        sectionId: menuItemTable.sectionId,
        name: menuItemTable.name,
        nameEn: menuItemTable.nameEn,
        description: menuItemTable.description,
        price: menuItemTable.price,
        priceUnknown: menuItemTable.priceUnknown,
        available: menuItemTable.available,
        featured: menuItemTable.featured,
        dishId: menuItemTable.dishId,
        sortOrder: menuItemTable.sortOrder,
        mediaPath: mediaTable.localPath,
        mediaWidth: mediaTable.width,
        mediaHeight: mediaTable.height,
      })
      .from(menuItemTable)
      .leftJoin(mediaTable, eq(mediaTable.id, menuItemTable.mediaId))
      .where(eq(menuItemTable.placeId, row.id))
      .orderBy(asc(menuItemTable.sortOrder)),
    db
      .select({ facetId: placeFacetTable.facetId })
      .from(placeFacetTable)
      .where(eq(placeFacetTable.placeId, row.id)),
    getSiteMean(),
    getDiscoveryPolicy(),
  ])
  const { ratingPriorCount } = discovery

  const itemsBySection = new Map<number, MenuItemView[]>()
  for (const item of items) {
    const view: MenuItemView = {
      id: item.id,
      name: item.name,
      nameEn: item.nameEn,
      description: item.description,
      price: item.price,
      priceUnknown: item.priceUnknown,
      available: item.available,
      featured: item.featured,
      image: toMediaRef(item.mediaPath, item.mediaWidth, item.mediaHeight),
      dishId: item.dishId,
    }
    const list = itemsBySection.get(item.sectionId)
    if (list) list.push(view)
    else itemsBySection.set(item.sectionId, [view])
  }

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    nameEn: row.nameEn,
    kind: row.kind,
    status: row.status,
    coords: toCoords(row.lat, row.lng),
    geoStatus: row.geoStatus,
    address: row.address,
    districtId: row.districtId,
    districtSlug: row.districtSlug,
    districtName: row.districtName,
    priceTier: row.priceTier,
    priceMin: row.priceMin,
    priceMedian: row.priceMedian,
    priceMax: row.priceMax,
    priceUnitFixed: row.priceUnitFixed,
    ribbon: row.ribbon,
    signatureItem: row.signatureItem,
    about: row.about,
    menuUrl: row.menuUrl,
    instagram: row.instagram,
    logo: toMediaRef(row.logoPath, row.logoWidth, row.logoHeight),
    ratingCount: row.ratingCount,
    rating: bayesianAverage(row.ratingSum, row.ratingCount, siteMean, ratingPriorCount),
    qualityScore: row.qualityScore,
    facetIds: facets.map((f) => f.facetId),
    phones,
    socials,
    hours: hours.map((h) => ({
      dow: h.dow,
      shiftIndex: h.shiftIndex,
      opensAt: toClock(h.opensAt),
      closesAt: toClock(h.closesAt),
      crossesMidnight: h.crossesMidnight,
      closed: h.closed,
    })),
    menu: sections.map((section) => ({
      id: section.id,
      name: section.name,
      description: section.description,
      facetId: section.facetId,
      image: toMediaRef(section.mediaPath, section.mediaWidth, section.mediaHeight),
      items: itemsBySection.get(section.id) ?? [],
    })),
    menuItemCount: items.length,
    lastVerifiedAt: row.lastVerifiedAt,
    updatedAt: row.updatedAt,
  }
}

/** همه‌ی slugها — برای `sitemap.ts` و `generateStaticParams`. */
export async function listPublishedSlugs(): Promise<{ slug: string; updatedAt: Date }[]> {
  const db = getDb()
  return db
    .select({ slug: placeTable.slug, updatedAt: placeTable.updatedAt })
    .from(placeTable)
    .where(eq(placeTable.status, 'published'))
    .orderBy(asc(placeTable.slug))
}

// ═══════════════════════════════════════════════════════════════════════
// محله
// ═══════════════════════════════════════════════════════════════════════

export interface DistrictView {
  id: string
  slug: string
  name: string
  center: Coords
  placeCount: number
}

/**
 * محله‌ها با تعداد مکانِ منتشرشده — محله‌ی خالی در UI نشان داده نمی‌شود.
 *
 * ═══ چرا `LEFT JOIN` و نه زیرپرس‌وجوی همبسته ═══
 *
 * نسخه‌ی قبلی به‌ازای **هر محله** یک `(SELECT COUNT(*) FROM place WHERE …)`
 * اجرا می‌کرد — ۲۹ اسکنِ جدا روی `place`. اندازه‌گیری‌شده: **۸۳۶ میلی‌ثانیه**
 * در حالت سرد.
 *
 * حالا یک `LEFT JOIN` با `GROUP BY` است: یک اسکن، و شمارش‌ها با هم درمی‌آیند.
 * `LEFT` عمدی است — محله‌ی بی‌کافه باید با شمارِ صفر برگردد، نه اینکه از
 * نتیجه بیفتد. `getDistrictBySlug` و صفحه‌ی محله روی همین صفر تصمیم می‌گیرند.
 *
 * ⚠️ شرطِ `status` در `ON` است نه در `WHERE`. اگر در `WHERE` باشد،
 * `LEFT JOIN` عملاً به `INNER JOIN` تبدیل می‌شود و محله‌های خالی حذف می‌شوند —
 * همان تله‌ای که این کامنت برای بستنش هست.
 */
export async function listDistricts(): Promise<DistrictView[]> {
  return cached('districts', async () => {
    const db = getDb()
    const rows = await db
      .select({
        id: districtTable.id,
        slug: districtTable.slug,
        name: districtTable.name,
        lat: districtTable.centerLat,
        lng: districtTable.centerLng,
        sortOrder: districtTable.sortOrder,
        placeCount: sql<number>`COUNT(${placeTable.id})`,
      })
      .from(districtTable)
      .leftJoin(
        placeTable,
        and(eq(placeTable.districtId, districtTable.id), eq(placeTable.status, 'published')),
      )
      .groupBy(
        districtTable.id,
        districtTable.slug,
        districtTable.name,
        districtTable.centerLat,
        districtTable.centerLng,
        districtTable.sortOrder,
      )
      .orderBy(asc(districtTable.sortOrder), asc(districtTable.name))

    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      center: toCoords(row.lat, row.lng) ?? { lat: 0, lng: 0 },
      placeCount: Number(row.placeCount),
    }))
  })
}

export async function getDistrictBySlug(slug: string): Promise<DistrictView | null> {
  const districts = await listDistricts()
  return districts.find((d) => d.slug === slug) ?? null
}

// ═══════════════════════════════════════════════════════════════════════
// نظرها
// ═══════════════════════════════════════════════════════════════════════

export interface ReviewView {
  id: number
  authorName: string
  stars: number
  text: string | null
  ratingCoffee: number | null
  ratingFood: number | null
  ratingVibe: number | null
  ratingService: number | null
  ratingValue: number | null
  /** ستون `DATE` در MySQL به `Date` تبدیل می‌شود، نه رشته. */
  visitDate: Date | null
  helpfulCount: number
  createdAt: Date
}

export async function listPlaceReviews(
  placeId: number,
  limit = 20,
): Promise<ReviewView[]> {
  const db = getDb()
  const rows = await db
    .select({
      id: reviewTable.id,
      authorName: reviewTable.authorName,
      stars: reviewTable.stars,
      text: reviewTable.text,
      ratingCoffee: reviewTable.ratingCoffee,
      ratingFood: reviewTable.ratingFood,
      ratingVibe: reviewTable.ratingVibe,
      ratingService: reviewTable.ratingService,
      ratingValue: reviewTable.ratingValue,
      visitDate: reviewTable.visitDate,
      helpfulCount: reviewTable.helpfulCount,
      createdAt: reviewTable.createdAt,
    })
    .from(reviewTable)
    .where(and(eq(reviewTable.placeId, placeId), eq(reviewTable.status, 'approved')))
    .orderBy(desc(reviewTable.helpfulCount), desc(reviewTable.createdAt))
    .limit(limit)
  return rows
}

// ═══════════════════════════════════════════════════════════════════════
// آمار کلی — برای صفحه‌ی اول و پنل ادمین
// ═══════════════════════════════════════════════════════════════════════

export interface SiteStats {
  publishedPlaces: number
  mappablePlaces: number
  menuItems: number
  itemsWithImage: number
  districts: number
  reviews: number
}

/**
 * آمار سایت برای صفحه‌ی اصلی.
 *
 * کش‌شده: شش `COUNT(*)` روی جدول‌های بزرگ است و اندازه‌گیری‌شده ۲۸۷
 * میلی‌ثانیه می‌برد — برای عددهایی که فقط با ایمپورت یا ثبت نظر عوض می‌شوند.
 */
export async function getSiteStats(): Promise<SiteStats> {
  return cached('siteStats', async () => {
  const db = getDb()
  const [row] = await db
    .select({
      publishedPlaces: sql<number>`(SELECT COUNT(*) FROM place WHERE status = 'published')`,
      mappablePlaces: sql<number>`(SELECT COUNT(*) FROM place WHERE status = 'published' AND geo_status = 'ok')`,
      menuItems: sql<number>`(SELECT COUNT(*) FROM menu_item)`,
      itemsWithImage: sql<number>`(SELECT COUNT(*) FROM menu_item WHERE media_id IS NOT NULL)`,
      districts: sql<number>`(SELECT COUNT(DISTINCT district_id) FROM place WHERE status = 'published' AND district_id IS NOT NULL)`,
      reviews: sql<number>`(SELECT COUNT(*) FROM review WHERE status = 'approved')`,
    })
    .from(sql`(SELECT 1) AS one`)

  return {
    publishedPlaces: Number(row?.publishedPlaces ?? 0),
    mappablePlaces: Number(row?.mappablePlaces ?? 0),
    menuItems: Number(row?.menuItems ?? 0),
    itemsWithImage: Number(row?.itemsWithImage ?? 0),
    districts: Number(row?.districts ?? 0),
    reviews: Number(row?.reviews ?? 0),
  }
  })
}

// ═══════════════════════════════════════════════════════════════════════
// facet و دیشِ یک مکان — «این کافه ۱۲ آیتم پاستا دارد، از ۳۲۰ هزار»
// ═══════════════════════════════════════════════════════════════════════

export interface PlaceFacetSummary {
  facetId: string
  labelFa: string
  icon: string | null
  kind: string
  itemCount: number
  minPrice: number | null
  medianPrice: number | null
}

/**
 * facetهای یک مکان با آمار.
 *
 * این همان چیزی است که صفحه‌ی کافه را از یک لیست منوی ساده متمایز می‌کند:
 * به‌جای «منو» یک عدد اثبات‌پذیر می‌دهد — «۱۲ آیتم پاستا، از ۳۲۰ هزار تومان».
 * فقط facetهای فیلترپذیر می‌آیند؛ «افزودنی» و «سرویس» برای کاربر بی‌معنی‌اند.
 */
export async function getPlaceFacetSummary(
  placeId: number,
): Promise<PlaceFacetSummary[]> {
  const db = getDb()
  const rows = await db
    .select({
      facetId: placeFacetTable.facetId,
      labelFa: facetTable.labelFa,
      icon: facetTable.icon,
      kind: facetTable.kind,
      itemCount: placeFacetTable.itemCount,
      minPrice: placeFacetTable.minPrice,
      medianPrice: placeFacetTable.medianPrice,
    })
    .from(placeFacetTable)
    .innerJoin(facetTable, eq(facetTable.id, placeFacetTable.facetId))
    .where(and(eq(placeFacetTable.placeId, placeId), eq(facetTable.isFilter, true)))
    .orderBy(desc(placeFacetTable.itemCount))
  return rows
}

export interface PlaceDishSummary {
  dishId: number
  slug: string
  nameFa: string
  facetId: string | null
  minPrice: number | null
  itemCount: number
  /** میانه‌ی شهریِ همان دیش — برای نشان دادن «ارزان‌تر از میانگین شهر». */
  cityMedian: number | null
}

/** دیش‌های یک مکان — ورودی نشان‌دادن «اینجا آلفردو دارد، ۴۲۰ هزار». */
export async function getPlaceDishes(placeId: number): Promise<PlaceDishSummary[]> {
  const db = getDb()
  return db
    .select({
      dishId: placeDishTable.dishId,
      slug: dishTable.slug,
      nameFa: dishTable.nameFa,
      facetId: dishTable.facetId,
      minPrice: placeDishTable.minPrice,
      itemCount: placeDishTable.itemCount,
      cityMedian: dishTable.medianPrice,
    })
    .from(placeDishTable)
    .innerJoin(dishTable, eq(dishTable.id, placeDishTable.dishId))
    .where(eq(placeDishTable.placeId, placeId))
    .orderBy(desc(placeDishTable.itemCount))
}

// ═══════════════════════════════════════════════════════════════════════
// کافه‌های نزدیک
// ═══════════════════════════════════════════════════════════════════════

/**
 * کافه‌های نزدیک به یک مکان.
 *
 * فیلتر کادر در SQL انجام می‌شود و فاصله‌ی دقیق در اپ: با ۳۳۱ مکان، تابع
 * هاورساین در SQL هیچ ایندکسی نمی‌تواند استفاده کند و فرقی هم نمی‌کند. کادر
 * اولیه تعداد ردیف را کم می‌کند و هاورساین ترتیب درست را می‌دهد.
 */
export async function listNearbyPlaces(
  origin: Coords,
  options: { excludePlaceId?: number; limit?: number; radiusKm?: number } = {},
): Promise<(PlaceCard & { distanceKm: number })[]> {
  const { excludePlaceId, limit = 6, radiusKm = 3 } = options
  // ۱ درجه عرض ≈ ۱۱۱ کیلومتر؛ طول در عرض ۳۶ درجه ≈ ۹۰ کیلومتر.
  const latSpan = radiusKm / 111
  const lngSpan = radiusKm / 90

  const cards = await listPlaceCards({
    mappableOnly: true,
    limit: 200,
    sort: 'rating',
  })

  return cards
    .filter((card) => {
      if (!card.coords) return false
      if (excludePlaceId && card.id === excludePlaceId) return false
      return (
        Math.abs(card.coords.lat - origin.lat) <= latSpan &&
        Math.abs(card.coords.lng - origin.lng) <= lngSpan
      )
    })
    .map((card) => ({ ...card, distanceKm: haversine(origin, card.coords!) }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit)
}

function haversine(a: Coords, b: Coords): number {
  const R = 6371
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat))
  return 2 * R * Math.asin(Math.sqrt(h))
}

// ═══════════════════════════════════════════════════════════════════════
// واژگان فیلتر — ورودی نوار فیلتر و «بهترین X نزدیک من»
// ═══════════════════════════════════════════════════════════════════════

export interface FilterFacet {
  id: string
  labelFa: string
  icon: string | null
  kind: string
  hint: string | null
  placeCount: number
  isPopular: boolean
}

/**
 * facetهای قابل فیلتر، مرتب بر اساس تعداد کافه.
 *
 * ترتیب بر اساس **تعداد واقعی** است نه `sort_order` دستی: فیلتری که فقط ۳
 * کافه دارد نباید بالای فیلتری بنشیند که ۱۷۱ کافه دارد. facetهای بی‌کافه
 * حذف می‌شوند — فیلتری که همیشه صفر نتیجه می‌دهد بدتر از نبودنش است.
 */
export async function listFilterFacets(): Promise<FilterFacet[]> {
  return cached('facets', async () => {
    const db = getDb()
    return db
      .select({
        id: facetTable.id,
        labelFa: facetTable.labelFa,
        icon: facetTable.icon,
        kind: facetTable.kind,
        hint: facetTable.hint,
        placeCount: facetTable.placeCount,
        isPopular: facetTable.isPopular,
      })
      .from(facetTable)
      .where(and(eq(facetTable.isFilter, true), sql`${facetTable.placeCount} > 0`))
      .orderBy(desc(facetTable.placeCount))
  })
}

/**
 * تعداد مکانِ منتشرشده برای هر ویژگی — «مناسب کار: ۴۲».
 *
 * ═══ چرا یک پرس‌وجو برای همه ═══
 *
 * صفحه‌ی اول چهار کارت نیت دارد و صفحه‌ی جست‌وجو کل فهرست ویژگی‌ها را نشان
 * می‌دهد. یک `countPlaces` به‌ازای هر ویژگی یعنی ۳۰ پرس‌وجوی جدا برای رندر
 * یک صفحه. این یکی همه را با هم می‌شمارد.
 *
 * `attribute` برخلاف `facet` ستون `place_count` ندارد — عمدی است: ویژگی را
 * آدم ثبت می‌کند و هر لحظه عوض می‌شود، پس عددِ کش‌شده‌ی روی جدول زود کهنه
 * می‌شد. کشِ ۶۰ ثانیه‌ای همین فایل کافی است.
 *
 * ویژگی‌ای که هیچ مکانی ندارد **در خروجی هست، با صفر** — برخلاف
 * `listFilterFacets` که صفرها را حذف می‌کند. صفحه‌ی اول باید بتواند بگوید
 * «هنوز هیچ کافه‌ای برای این حالت ثبت نشده» و برای آن به عددِ صفر نیاز دارد.
 */
export async function listAttributeCounts(): Promise<Record<string, number>> {
  return cached('attributeCounts', async () => {
    const db = getDb()
    const rows = await db
      .select({
        attributeId: placeAttributeTable.attributeId,
        placeCount: sql<number>`COUNT(DISTINCT ${placeAttributeTable.placeId})`,
      })
      .from(placeAttributeTable)
      .innerJoin(placeTable, eq(placeTable.id, placeAttributeTable.placeId))
      .where(and(eq(placeTable.status, 'published'), sql`${placeAttributeTable.value} >= 1`))
      .groupBy(placeAttributeTable.attributeId)

    const counts: Record<string, number> = {}
    for (const row of rows) counts[row.attributeId] = Number(row.placeCount)
    return counts
  })
}

export interface PopularDish {
  id: number
  slug: string
  nameFa: string
  facetId: string | null
  placeCount: number
  minPrice: number | null
  medianPrice: number | null
}

/**
 * دیش‌هایی که «بهترین X نزدیک من» برایشان معنی دارد.
 *
 * شرطش در `scripts/build-facets.ts` اعمال شده: علامت‌خورده در واژگان **و**
 * حضور در حداقل ۱۵ کافه. زیر آن، پیشنهاد بی‌فایده است — «بهترین سوشی نزدیک
 * من» وقتی ۳ کافه سوشی دارند، همان ۳ را نشان می‌دهد و کاربر فکر می‌کند
 * فیلتر خراب است.
 */
export async function listPopularDishes(limit = 24): Promise<PopularDish[]> {
  return cached(`dishes:${limit}`, async () => {
    const db = getDb()
    return db
      .select({
        id: dishTable.id,
        slug: dishTable.slug,
        nameFa: dishTable.nameFa,
        facetId: dishTable.facetId,
        placeCount: dishTable.placeCount,
        minPrice: dishTable.minPrice,
        medianPrice: dishTable.medianPrice,
      })
      .from(dishTable)
      .where(eq(dishTable.isPopular, true))
      .orderBy(desc(dishTable.placeCount))
      .limit(limit)
  })
}

export async function getDishBySlug(slug: string): Promise<PopularDish | null> {
  const db = getDb()
  const [row] = await db
    .select({
      id: dishTable.id,
      slug: dishTable.slug,
      nameFa: dishTable.nameFa,
      facetId: dishTable.facetId,
      placeCount: dishTable.placeCount,
      minPrice: dishTable.minPrice,
      medianPrice: dishTable.medianPrice,
    })
    .from(dishTable)
    .where(eq(dishTable.slug, slug))
    .limit(1)
  return row ?? null
}

/**
 * کارت‌ها همراه با قیمت یک دیش مشخص در هر مکان.
 *
 * برای «بهترین پاستا نزدیک من» لازم است: کاربر می‌خواهد بداند پاستای *همین
 * کافه* چند است، نه میانگین کل منو.
 */
export async function listCardsWithDishPrice(
  dishId: number,
  filters: ListFilters = {},
): Promise<(PlaceCard & { dishPrice: number | null; dishItemCount: number })[]> {
  const cards = await listPlaceCards({ ...filters, dishId })
  if (cards.length === 0) return []

  const db = getDb()
  const rows = await db
    .select({
      placeId: placeDishTable.placeId,
      minPrice: placeDishTable.minPrice,
      itemCount: placeDishTable.itemCount,
    })
    .from(placeDishTable)
    .where(
      and(
        eq(placeDishTable.dishId, dishId),
        inArray(
          placeDishTable.placeId,
          cards.map((card) => card.id),
        ),
      ),
    )
  const byPlace = new Map(rows.map((row) => [row.placeId, row]))

  return cards.map((card) => ({
    ...card,
    dishPrice: byPlace.get(card.id)?.minPrice ?? null,
    dishItemCount: byPlace.get(card.id)?.itemCount ?? 0,
  }))
}
