/**
 * تبدیل فیلترها به URL و برعکس.
 *
 * URL همچنان تنها منبع حقیقتِ وضعیت جست‌وجوست — همان تصمیم درستِ نسخه‌ی قبلی.
 * اما حالا این کد روی *سرور* هم اجرا می‌شود: صفحه‌ی `/search` پارامترها را
 * می‌خواند، جست‌وجو را انجام می‌دهد و نتیجه را داخل HTML رندر می‌کند. یعنی یک
 * لینک فیلترشده هم قابل اشتراک است، هم برای کرالر قابل خواندن.
 *
 * پارامترها شناسه‌محورند (`intents=laptop_friendly,cozy`) نه برچسب فارسی
 * URL-encode شده. هم کوتاه‌تر است، هم پایدار در برابر تغییر برچسب‌ها.
 */

import type { PlaceKind, PriceTier } from '@/core/places/types'
import type { SearchFilters, SortKey } from './query'
import { EMPTY_FILTERS } from './query'
import { keepKnownAttributes } from '@/core/taxonomy/attributes'

export type ViewMode = 'list' | 'map'

export interface SearchState extends SearchFilters {
  query: string
  view: ViewMode
}

const SORT_KEYS: SortKey[] = ['relevance', 'rating', 'near', 'popular']
const KINDS: PlaceKind[] = ['cafe', 'cafe_restaurant', 'restaurant']

/** ورودی از URL هرگز قابل اعتماد نیست — فقط مقادیر شناخته‌شده پذیرفته می‌شوند. */
function oneOf<T extends string>(value: string | undefined, allowed: readonly T[]): T | null {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : null
}

/** `searchParams` در Next یا رشته است یا آرایه — هر دو را به رشته تبدیل می‌کنیم. */
type RawParams = Record<string, string | string[] | undefined>

function first(params: RawParams, key: string): string | undefined {
  const v = params[key]
  return Array.isArray(v) ? v[0] : v
}

export function parseSearchState(params: RawParams): SearchState {
  const rawIntents = first(params, 'intents')
  const priceRaw = Number(first(params, 'price'))

  return {
    ...EMPTY_FILTERS,
    query: first(params, 'q') ?? '',
    attributeIds: rawIntents ? keepKnownAttributes(rawIntents.split(',').filter(Boolean)) : [],
    districtId: first(params, 'district') ?? '',
    priceTier:
      priceRaw === 1 || priceRaw === 2 || priceRaw === 3 ? (priceRaw as PriceTier) : null,
    kind: oneOf(first(params, 'kind'), KINDS),
    openNow: first(params, 'open') === '1',
    sort: oneOf(first(params, 'sort'), SORT_KEYS) ?? 'relevance',
    text: '',
    view: first(params, 'view') === 'map' ? 'map' : 'list',
  }
}

/** وضعیت → query string. مقادیر پیش‌فرض حذف می‌شوند تا URL تمیز بماند. */
export function buildSearchQuery(state: SearchState): string {
  const search = new URLSearchParams()

  if (state.query.trim()) search.set('q', state.query.trim())
  if (state.attributeIds.length) search.set('intents', state.attributeIds.join(','))
  if (state.districtId) search.set('district', state.districtId)
  if (state.priceTier !== null) search.set('price', String(state.priceTier))
  if (state.kind) search.set('kind', state.kind)
  if (state.openNow) search.set('open', '1')
  if (state.sort !== 'relevance') search.set('sort', state.sort)
  if (state.view === 'map') search.set('view', 'map')

  const qs = search.toString()
  return qs ? `?${qs}` : ''
}

export function searchHref(state: SearchState): string {
  return `/search${buildSearchQuery(state)}`
}

/** تعداد فیلترهای «پیشرفته»ی فعال — برای نشان روی دکمه‌ی فیلترها. */
export function countAdvanced(state: SearchState): number {
  return (
    (state.priceTier !== null ? 1 : 0) +
    (state.kind ? 1 : 0) +
    (state.districtId ? 1 : 0) +
    (state.sort !== 'relevance' ? 1 : 0)
  )
}
