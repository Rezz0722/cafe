/**
 * فیلتر و رتبه‌بندی.
 *
 * تفاوت‌های اصلی با `lib/search.ts` قدیمی:
 *
 *   ۱. فیلتر روی *شناسه* اجرا می‌شود نه رشته‌ی فارسی — باگ برخورد پیشوند
 *      از اساس ممکن نیست.
 *   ۲. نیت‌ها با OR-به‌علاوه‌ی-امتیاز ترکیب می‌شوند، نه AND سخت. کاربری که
 *      «دنج و مناسب کار» می‌خواهد، اگر جای کاملاً منطبق نبود باید نزدیک‌ترین
 *      گزینه‌ها را ببیند، نه صفحه‌ی خالی. AND سخت مهم‌ترین دلیل نتیجه‌ی صفر است.
 *   ۳. رتبه‌بندی ترکیبی است و *تازگی داده* را هم وارد می‌کند — کافه‌ای که
 *      اطلاعاتش به‌روز است بالاتر می‌آید. هم به کاربر خدمت می‌کند، هم به
 *      کافه‌دار انگیزه‌ی به‌روزرسانی می‌دهد.
 */

import type { PlaceKind, PlaceView, PriceTier } from '@/core/places/types'
import { matchIntents } from '@/core/taxonomy/matchIntent'
import { keepKnownAttributes } from '@/core/taxonomy/attributes'
import { normalizeFa } from '@/core/text/normalize'
import { stripStopwords } from '@/core/text/stopwords'

export type SortKey = 'relevance' | 'rating' | 'near' | 'popular'

export interface SearchFilters {
  /** شناسه‌ی ویژگی‌ها — هرگز برچسب فارسی. */
  attributeIds: string[]
  districtId: string
  priceTier: PriceTier | null
  kind: PlaceKind | null
  openNow: boolean
  sort: SortKey
  /** متن آزاد باقی‌مانده بعد از استخراج نیت — برای تطابق با نام. */
  text: string
}

export const EMPTY_FILTERS: SearchFilters = {
  attributeIds: [],
  districtId: '',
  priceTier: null,
  kind: null,
  openNow: false,
  sort: 'relevance',
  text: '',
}

/**
 * از یک عبارت آزاد، فیلترِ آماده می‌سازد.
 * محله هم از متن استخراج می‌شود («صبحانه در سجاد»).
 */
export function filtersFromQuery(
  query: string,
  districts: { id: string; name: string }[],
): Pick<SearchFilters, 'attributeIds' | 'districtId' | 'text'> {
  const { attributeIds, residual } = matchIntents(query)

  let text = residual
  let districtId = ''
  for (const d of districts) {
    const name = normalizeFa(d.name)
    if (name && text.includes(name)) {
      districtId = d.id
      text = text.replace(name, ' ').replace(/\s+/g, ' ').trim()
      break
    }
  }

  // واژه‌های بی‌محتوا باید بروند، وگرنه باقی‌مانده‌ی یک جمله‌ی طبیعی
  // («… برای کار در …») به‌عنوان فیلتر نام اعمال می‌شود و همه را حذف می‌کند.
  return { attributeIds, districtId, text: stripStopwords(text) }
}

/** فیلترهای سخت — چیزهایی که کاربر صریحاً انتخاب کرده و نقض‌شدنی نیستند. */
function passesHardFilters(place: PlaceView, f: SearchFilters): boolean {
  if (place.status !== 'published') return false
  if (f.districtId && place.districtId !== f.districtId) return false
  if (f.priceTier !== null && place.priceTier !== f.priceTier) return false
  if (f.kind !== null && place.kind !== f.kind) return false
  if (f.openNow && !place.isOpenNow) return false
  return true
}

/**
 * تطابق متن آزاد با نام و آدرس.
 *
 * تطابق روی *توکن* است نه کل رشته: «رف سجاد» باید «کافه رُف» در سجاد را پیدا
 * کند، در حالی که `includes` روی کل رشته شکست می‌خورد.
 */
function matchesText(place: PlaceView, text: string): boolean {
  if (!text) return true
  const haystack = normalizeFa(`${place.name} ${place.address}`)
  return text.split(' ').some((token) => token.length > 1 && haystack.includes(token))
}

/** چند درصد از نیت‌های درخواستی را این مکان دارد؟ ۰..۱ */
function intentCoverage(place: PlaceView, attributeIds: string[]): number {
  if (!attributeIds.length) return 1

  let score = 0
  for (const id of attributeIds) {
    const attr = place.attributes.find((a) => a.attributeId === id)
    if (!attr) continue
    // مقدار ۲ («بله») امتیاز کامل، مقدار ۱ («تاحدی») نصف.
    score += attr.value === 2 ? 1 : attr.value === 1 ? 0.5 : 0
  }
  return score / attributeIds.length
}

export interface ScoredPlace {
  place: PlaceView
  score: number
  coverage: number
}

/** وزن‌های رتبه‌بندی ترکیبی. */
const W = {
  intent: 55, // مهم‌ترین سیگنال — کاربر همین را خواسته
  rating: 20,
  distance: 10,
  freshness: 10, // داده‌ی تازه بالاتر می‌آید
  quality: 5,
}

function scorePlace(place: PlaceView, f: SearchFilters, maxDistance: number): number {
  const coverage = intentCoverage(place, f.attributeIds)

  // امتیاز بیزی ۰..۵ → ۰..۱
  const ratingPart = Math.min(place.rating / 5, 1)

  // نزدیک‌تر بهتر؛ وقتی فاصله نداریم خنثی حساب می‌شود.
  const distancePart =
    place.distanceKm === null || maxDistance <= 0
      ? 0.5
      : 1 - Math.min(place.distanceKm / maxDistance, 1)

  return (
    coverage * W.intent +
    ratingPart * W.rating +
    distancePart * W.distance +
    (place.freshnessScore / 100) * W.freshness +
    (place.qualityScore / 100) * W.quality
  )
}

/** امتیاز اضافه برای تطابق نام — وقتی متن آزاد فیلتر سخت نیست. */
const TEXT_BONUS = 25

export function searchPlaces(places: PlaceView[], f: SearchFilters): ScoredPlace[] {
  const attributeIds = keepKnownAttributes(f.attributeIds)
  const filters = { ...f, attributeIds }

  let candidates = places.filter((p) => passesHardFilters(p, filters))

  /**
   * متن آزاد فقط وقتی *دروازه* است که نیتی استخراج نشده باشد — یعنی کاربر
   * دارد دنبال نام می‌گردد. اگر نیت داریم، متن باقی‌مانده صرفاً یک سیگنال
   * است، نه شرط. در غیر این صورت یک واژه‌ی ناشناخته در جمله («کافه‌ای دنج
   * با موزیک ملایم») کل نتایجِ درست را حذف می‌کند.
   */
  const textIsGate = filters.text.length > 0 && attributeIds.length === 0
  if (textIsGate) {
    candidates = candidates.filter((p) => matchesText(p, filters.text))
  }

  const distances = candidates
    .map((p) => p.distanceKm)
    .filter((d): d is number => d !== null)
  const maxDistance = distances.length ? Math.max(...distances) : 0

  const scored: ScoredPlace[] = candidates.map((place) => {
    const textBonus =
      !textIsGate && filters.text && matchesText(place, filters.text) ? TEXT_BONUS : 0
    return {
      place,
      score: scorePlace(place, filters, maxDistance) + textBonus,
      coverage: intentCoverage(place, attributeIds),
    }
  })

  // وقتی نیت خواسته شده، مکان‌هایی که *هیچ‌کدام* را ندارند حذف می‌شوند.
  // این همان تعادل بین AND سخت و OR شل است: نتیجه‌ی بی‌ربط نشان نده، ولی
  // برای نبودِ تطابق کامل هم صفحه را خالی نکن.
  const relevant = attributeIds.length ? scored.filter((s) => s.coverage > 0) : scored

  return sortScored(relevant, filters.sort)
}

function sortScored(items: ScoredPlace[], sort: SortKey): ScoredPlace[] {
  const out = [...items]
  switch (sort) {
    case 'rating':
      out.sort((a, b) => b.place.rating - a.place.rating)
      break
    case 'near':
      out.sort((a, b) => {
        if (a.place.distanceKm === null) return 1
        if (b.place.distanceKm === null) return -1
        return a.place.distanceKm - b.place.distanceKm
      })
      break
    case 'popular':
      out.sort((a, b) => b.place.ratingCount - a.place.ratingCount)
      break
    default:
      out.sort((a, b) => b.score - a.score)
  }
  return out
}

/** مکان‌های مشابه — محاسبه‌شده، نه فهرست دستیِ `similar` قدیمی. */
export function findSimilar(target: PlaceView, all: PlaceView[], limit = 3): PlaceView[] {
  const targetAttrs = new Set(target.activeAttributeIds)

  return all
    .filter((p) => p.id !== target.id && p.status === 'published')
    .map((p) => {
      const shared = p.activeAttributeIds.filter((id) => targetAttrs.has(id)).length
      const sameDistrict = p.districtId === target.districtId ? 1 : 0
      return { place: p, score: shared * 2 + sameDistrict + p.rating / 5 }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.place)
}
