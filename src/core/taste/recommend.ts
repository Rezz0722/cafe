/**
 * امتیازدهی پیشنهاد شخصی.
 *
 * ═══ چرا در حافظه و نه در SQL ═══
 *
 * فرمول امتیاز چند جزء دارد که وزنشان ممکن است عوض شود، و روی ۳۳۱ کافه
 * محاسبه‌اش کمتر از یک میلی‌ثانیه است. نوشتنش در SQL یعنی هر تغییر فرمول یک
 * پرس‌وجوی پیچیده‌تر، و از همه بدتر: **غیرقابل تست بدون دیتابیس**. این تابع
 * خالص است و تست دارد.
 *
 * ═══ چرا امتیاز شکسته برمی‌گردد ═══
 *
 * `reasons` می‌گوید *چرا* این کافه پیشنهاد شده («پاستا دارد»، «در محله‌ی
 * شماست»). پیشنهادِ بی‌دلیل، کاربر را متقاعد نمی‌کند و اگر اشتباه باشد هم
 * قابل تشخیص نیست.
 */

import type { Weight } from './quiz'

export interface ScorableePlace {
  id: number
  facetIds: string[]
  districtId: string | null
  priceTier: number
  priceMedian?: number | null
  /** میانگین بیزی — بین ۰ و ۵. */
  rating: number
  ratingCount: number
  qualityScore: number
  /** شناسه‌ی دیش‌هایی که این کافه دارد. */
  dishSlugs?: string[]
  /** شناسه‌ی ویژگی‌های تأییدشده. */
  attributeIds?: string[]
}

export interface ScoredPlace<T> {
  place: T
  score: number
  reasons: string[]
}

export interface ScoreOptions {
  weights: Weight[]
  budgetBand?: 1 | 2 | 3 | null
  /** برچسب خواندنی برای هر refId — برای ساخت `reasons`. */
  labels?: Record<string, string>
  /** محله‌هایی که کاربر بیشتر در آن‌ها فعال بوده (از رفتار، نه از سؤال). */
  favouriteDistrictIds?: string[]
}

/**
 * وزن اجزای امتیاز.
 *
 * `taste` بیشترین سهم را دارد چون کل هدفِ این صفحه شخصی‌سازی است. ولی
 * `quality` هم سهم دارد: پیشنهادِ کافه‌ای که فقط یک نام و یک آدرس دارد،
 * حتی اگر کاملاً به سلیقه بخورد، به کاربر کمکی نمی‌کند.
 */
const COMPONENT = {
  /** هر facet/dish منطبق، ضربدر وزنش. */
  tastePerMatch: 10,
  /** خوردن باند بودجه. */
  budgetExact: 12,
  budgetNear: 5,
  /** محله‌ی موردعلاقه. */
  district: 8,
  /** امتیاز کاربران — تا ۱۰. */
  ratingMax: 10,
  /** کامل‌بودن پروفایل — تا ۸. */
  qualityMax: 8,
} as const

export function scorePlace<T extends ScorableePlace>(
  place: T,
  options: ScoreOptions,
): ScoredPlace<T> {
  const { weights, budgetBand, labels = {}, favouriteDistrictIds = [] } = options
  let score = 0
  const reasons: string[] = []

  const facetSet = new Set(place.facetIds)
  const dishSet = new Set(place.dishSlugs ?? [])
  const attributeSet = new Set(place.attributeIds ?? [])

  for (const weight of weights) {
    const has =
      weight.kind === 'facet'
        ? facetSet.has(weight.refId)
        : weight.kind === 'dish'
          ? dishSet.has(weight.refId)
          : weight.kind === 'attribute'
            ? attributeSet.has(weight.refId)
            : weight.kind === 'district'
              ? place.districtId === weight.refId
              : false

    if (!has) continue
    score += weight.weight * COMPONENT.tastePerMatch

    // فقط دلایل مثبت گفته می‌شوند. «قلیان ندارد» دلیلِ پیشنهاد نیست.
    if (weight.weight > 0) {
      const label = labels[`${weight.kind}:${weight.refId}`] ?? labels[weight.refId]
      if (label && reasons.length < 3) reasons.push(label)
    }
  }

  /*
    وزن منفی روی چیزی که کافه **دارد**، امتیاز را کم می‌کند (بالا انجام شد).
    ولی وزن منفی روی چیزی که کافه ندارد، پاداش نیست — وگرنه کافه‌ی بی‌منو
    برنده‌ی «قلیان نمی‌خواهم» می‌شد.
  */

  if (budgetBand && place.priceMedian !== null) {
    if (place.priceTier === budgetBand) {
      score += COMPONENT.budgetExact
      reasons.push('در بودجه‌ی شما')
    } else if (Math.abs(place.priceTier - budgetBand) === 1) {
      score += COMPONENT.budgetNear
    }
    // فاصله‌ی دو رده: هیچ امتیازی، ولی حذف هم نمی‌شود. کافه‌ی گران‌تر ممکن
    // است ارزشش را داشته باشد و تصمیمش با کاربر است.
  }

  if (place.districtId && favouriteDistrictIds.includes(place.districtId)) {
    score += COMPONENT.district
    reasons.push('در محله‌ی معمول شما')
  }

  // امتیاز کاربران فقط وقتی وزن دارد که نظری وجود داشته باشد.
  if (place.ratingCount > 0) {
    score += (place.rating / 5) * COMPONENT.ratingMax * (place.ratingCount / (place.ratingCount + 5))
  }

  score += (place.qualityScore / 100) * COMPONENT.qualityMax

  return { place, score: Math.round(score * 10) / 10, reasons }
}

/**
 * مرتب‌سازی پیشنهادها.
 *
 * کافه‌هایی که **هیچ** تطابق سلیقه‌ای ندارند حذف می‌شوند، نه اینکه پایین
 * فهرست بیایند: «پیشنهاد شخصی» که ۳۰۰ کافه‌ی نامرتبط دارد، فهرستِ عمومی است
 * با نامی گمراه‌کننده. ولی اگر پروفایل سلیقه خالی باشد، همه می‌مانند و
 * رتبه‌بندی به کیفیت و امتیاز می‌افتد.
 */
export function rankPlaces<T extends ScorableePlace>(
  places: T[],
  options: ScoreOptions & { limit?: number; requireMatch?: boolean },
): ScoredPlace<T>[] {
  const { limit = 12, requireMatch = options.weights.some(weight=>weight.weight>0) } = options
  const scored = places.map((place) => scorePlace(place, options))
  const filtered = requireMatch ? scored.filter(({place}) => options.weights.some(weight => weight.weight>0 && (
    weight.kind==='dish' ? place.dishSlugs?.includes(weight.refId) :
    weight.kind==='facet' ? place.facetIds.includes(weight.refId) :
    weight.kind==='attribute' ? place.attributeIds?.includes(weight.refId) :
    weight.kind==='district' ? place.districtId===weight.refId : false
  ))) : scored
  return filtered.sort((first, second) => second.score - first.score || second.place.qualityScore-first.place.qualityScore || first.place.id-second.place.id).slice(0, limit)
}
