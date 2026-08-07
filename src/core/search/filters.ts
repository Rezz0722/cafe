/**
 * وضعیت فیلترها در URL.
 *
 * ═══ چرا در URL و نه در state ═══
 *
 * فیلتر باید **قابل اشتراک‌گذاری و قابل بوکمارک** باشد: «ارزان‌ترین پاستاهای
 * وکیل‌آباد» یک لینک است که کاربر می‌فرستد به دوستش. اگر فیلتر در state
 * کلاینت بماند، آن لینک وجود ندارد و دکمه‌ی back مرورگر هم کار نمی‌کند.
 *
 * برای SEO هم لازم است: صفحات «فیلترِ محبوب» (کافه‌های پاستادار سجاد) همان
 * صفحاتی هستند که جست‌وجوی واقعی دارند.
 *
 * ═══ قرارداد ═══
 *
 * پارامترهای خالی از URL حذف می‌شوند تا آدرس تمیز بماند و دو URL متفاوت به
 * یک نتیجه نرسند (مسئله‌ی محتوای تکراری در SEO).
 */

export type SortKey = 'rating' | 'price_asc' | 'price_desc' | 'quality' | 'name' | 'distance'

export interface SearchFilters {
  /** جست‌وجوی متنی روی نام کافه. */
  q: string
  /**
   * «متن را همان‌طور که نوشتم جست‌وجو کن.»
   *
   * به‌طور پیش‌فرض، `parseSearchQuery` نام منطقه را از متن بیرون می‌کشد و به
   * فیلتر تبدیل می‌کند. برای «کافه‌ای در احمد آباد» این همان چیزی است که کاربر
   * می‌خواهد — ولی برای کسی که دنبال کافه‌ای *به نام* «سجاد» است، نه. این
   * پرچم تشخیص را خاموش می‌کند و راهِ برگشت از حدسِ ما است.
   */
  rawQuery: boolean
  /** شناسه‌ی facet — کافه باید همه‌ی این‌ها را داشته باشد. */
  facets: string[]
  /**
   * شناسه‌ی ویژگی — «مناسب کار»، «فضای باز». کافه باید همه‌ی این‌ها را داشته
   * باشد. جدا از `facets` چون facet از منو اثبات می‌شود و ویژگی را آدم ثبت
   * می‌کند؛ قاطی‌کردنشان یعنی فیلترِ اثبات‌پذیر و فیلترِ سلیقه‌ای یک اعتبار
   * داشته باشند.
   */
  attributes: string[]
  /** slug دیش — «بهترین پاستا». */
  dish: string | null
  districtId: string | null
  /** رده‌های قیمت انتخاب‌شده (۱..۳). خالی = همه. */
  tiers: number[]
  /** سقف قیمت به تومان، روی میانه‌ی منو. */
  maxPrice: number | null
  /** فقط کافه‌هایی که الان باز هستند. */
  openNow: boolean
  /** مرتب‌سازی بر اساس فاصله از کاربر — نیاز به اجازه‌ی موقعیت. */
  nearMe: boolean
  sort: SortKey
  /** نمای نقشه به‌جای فهرست. */
  view: 'list' | 'map'
  page: number
}

export const DEFAULT_FILTERS: SearchFilters = {
  q: '',
  rawQuery: false,
  facets: [],
  attributes: [],
  dish: null,
  districtId: null,
  tiers: [],
  maxPrice: null,
  openNow: false,
  nearMe: false,
  sort: 'rating',
  view: 'list',
  page: 1,
}

const SORT_KEYS: SortKey[] = ['rating', 'price_asc', 'price_desc', 'quality', 'name', 'distance']

export const SORT_LABELS: Record<SortKey, string> = {
  rating: 'محبوب‌ترین',
  distance: 'نزدیک‌ترین',
  price_asc: 'ارزان‌ترین',
  price_desc: 'گران‌ترین',
  quality: 'کامل‌ترین اطلاعات',
  name: 'الفبا',
}

/**
 * سقف‌های آماده‌ی قیمت.
 *
 * از توزیع واقعی میانه‌ی کافه‌ها آمده (صدک ۲۵ روی ۲۲۰ هزار، میانه ۲۹۷ هزار،
 * صدک ۷۵ روی ۴۴۸ هزار)، رُند شده تا در UI قابل گفتن باشد.
 */
export const PRICE_CAPS = [200_000, 300_000, 500_000, 800_000] as const

export const TIER_LABELS: Record<number, string> = {
  1: 'اقتصادی',
  2: 'متوسط',
  3: 'گران',
}

type Params = Record<string, string | string[] | undefined>

function firstValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ''
  return value ?? ''
}

function parseList(value: string | string[] | undefined): string[] {
  const raw = Array.isArray(value) ? value.join(',') : (value ?? '')
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
}

/** خواندن فیلترها از `searchParams` — با نادیده‌گرفتنِ امنِ مقادیر خراب. */
export function parseFilters(params: Params): SearchFilters {
  const sortRaw = firstValue(params.sort) as SortKey
  const viewRaw = firstValue(params.view)
  const pageRaw = Number.parseInt(firstValue(params.page), 10)
  const maxPriceRaw = Number.parseInt(firstValue(params.max), 10)

  const tiers = parseList(params.tier)
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => value === 1 || value === 2 || value === 3)

  const nearMe = firstValue(params.near) === '1'

  return {
    q: firstValue(params.q).slice(0, 80),
    rawQuery: firstValue(params.raw) === '1',
    facets: parseList(params.f).slice(0, 6),
    attributes: parseList(params.a).slice(0, 4),
    dish: firstValue(params.dish) || null,
    districtId: firstValue(params.d) || null,
    tiers: [...new Set(tiers)],
    maxPrice: Number.isFinite(maxPriceRaw) && maxPriceRaw > 0 ? maxPriceRaw : null,
    openNow: firstValue(params.open) === '1',
    nearMe,
    // «نزدیک‌ترین» بدون اجازه‌ی موقعیت بی‌معنی است، پس `near=1` خودش
    // مرتب‌سازی را هم تعیین می‌کند مگر کاربر صریحاً چیز دیگری خواسته باشد.
    sort: SORT_KEYS.includes(sortRaw) ? sortRaw : nearMe ? 'distance' : 'rating',
    view: viewRaw === 'map' ? 'map' : 'list',
    page: Number.isFinite(pageRaw) && pageRaw > 0 ? Math.min(pageRaw, 50) : 1,
  }
}

/** ساخت query string — پارامترهای پیش‌فرض حذف می‌شوند. */
export function buildQuery(filters: Partial<SearchFilters>): string {
  const merged = { ...DEFAULT_FILTERS, ...filters }
  const params = new URLSearchParams()

  if (merged.q.trim()) params.set('q', merged.q.trim())
  // بدون متن، `raw` معنی ندارد و فقط آدرس را شلوغ می‌کند.
  if (merged.rawQuery && merged.q.trim()) params.set('raw', '1')
  if (merged.facets.length) params.set('f', merged.facets.join(','))
  if (merged.attributes.length) params.set('a', merged.attributes.join(','))
  if (merged.dish) params.set('dish', merged.dish)
  if (merged.districtId) params.set('d', merged.districtId)
  if (merged.tiers.length) params.set('tier', [...merged.tiers].sort().join(','))
  if (merged.maxPrice) params.set('max', String(merged.maxPrice))
  if (merged.openNow) params.set('open', '1')
  if (merged.nearMe) params.set('near', '1')
  // اگر «نزدیک من» روشن است، `sort=distance` اضافی است.
  if (merged.sort !== 'rating' && !(merged.nearMe && merged.sort === 'distance')) {
    params.set('sort', merged.sort)
  }
  if (merged.view === 'map') params.set('view', 'map')
  if (merged.page > 1) params.set('page', String(merged.page))

  const query = params.toString()
  return query ? `?${query}` : ''
}

export function searchPath(filters: Partial<SearchFilters>): string {
  return `/search${buildQuery(filters)}`
}

/** آیا هیچ فیلتری فعال است؟ برای نمایش دکمه‌ی «پاک‌کردن فیلترها». */
export function hasActiveFilters(filters: SearchFilters): boolean {
  return (
    filters.q.trim() !== '' ||
    filters.facets.length > 0 ||
    filters.attributes.length > 0 ||
    filters.dish !== null ||
    filters.districtId !== null ||
    filters.tiers.length > 0 ||
    filters.maxPrice !== null ||
    filters.openNow ||
    filters.nearMe
  )
}

/** تعداد فیلترهای فعال — برای نشانِ عددی روی دکمه‌ی فیلتر در موبایل. */
export function countActiveFilters(filters: SearchFilters): number {
  return (
    (filters.q.trim() ? 1 : 0) +
    filters.facets.length +
    filters.attributes.length +
    (filters.dish ? 1 : 0) +
    (filters.districtId ? 1 : 0) +
    filters.tiers.length +
    (filters.maxPrice ? 1 : 0) +
    (filters.openNow ? 1 : 0) +
    (filters.nearMe ? 1 : 0)
  )
}

/**
 * عنوان صفحه از فیلترها.
 *
 * برای SEO و برای اینکه کاربر بفهمد چه دید. «بهترین پاستا در وکیل‌آباد»
 * عنوانِ یک صفحه‌ی واقعی است، نه «نتایج جست‌وجو».
 */
export function describeFilters(
  filters: SearchFilters,
  lookups: {
    facetLabel?: (id: string) => string | undefined
    attributeLabel?: (id: string) => string | undefined
    dishLabel?: (slug: string) => string | undefined
    districtLabel?: (id: string) => string | undefined
  } = {},
): string {
  const parts: string[] = []

  /*
    facet و ویژگی در عنوان با هم می‌آیند: کاربری که «کافه‌های پاستادارِ مناسب
    کار» را فیلتر کرده، عنوانی می‌خواهد که هر دو شرط را بگوید. تفکیکشان فقط
    در لایه‌ی داده مهم است، نه در جمله‌ای که به آدم نشان داده می‌شود.
  */
  const tagLabels = [
    ...filters.facets.map((id) => lookups.facetLabel?.(id) ?? id),
    ...filters.attributes.map((id) => lookups.attributeLabel?.(id) ?? id),
  ]

  if (filters.dish) {
    const label = lookups.dishLabel?.(filters.dish) ?? filters.dish
    parts.push(filters.nearMe ? `بهترین ${label} نزدیک من` : `بهترین ${label}`)
  } else if (tagLabels.length > 0) {
    parts.push(`کافه‌های ${tagLabels.join(' و ')}`)
  } else if (filters.q.trim()) {
    parts.push(`جست‌وجوی «${filters.q.trim()}»`)
  } else {
    parts.push('کافه‌های مشهد')
  }

  if (filters.districtId) {
    const label = lookups.districtLabel?.(filters.districtId)
    if (label) parts.push(`در ${label}`)
  }
  if (filters.tiers.length === 1) parts.push(`— ${TIER_LABELS[filters.tiers[0]!]}`)
  if (filters.maxPrice) parts.push(`— تا ${filters.maxPrice.toLocaleString('fa-IR')} تومان`)
  if (filters.openNow) parts.push('— باز است')

  return parts.join(' ')
}
