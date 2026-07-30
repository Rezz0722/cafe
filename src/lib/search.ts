import { CAFES } from '@/data/cafes'
import { HOODS, INTENTS } from '@/data/taxonomy'
import type { Cafe, PriceKey, SortKey, VenueType } from '@/types'

export interface Filters {
  /** Intent tags the venue must carry — all of them, not any. */
  intents: string[]
  openNow: boolean
  price: PriceKey | ''
  type: VenueType | ''
  hood: string
  sort: SortKey
}

export const EMPTY_FILTERS: Filters = {
  intents: [],
  openNow: false,
  price: '',
  type: '',
  hood: '',
  sort: 'rating',
}

const SORTERS: Record<SortKey, (a: Cafe, b: Cafe) => number> = {
  rating: (a, b) => b.rating - a.rating,
  near: (a, b) => a.distanceKm - b.distanceKm,
  popular: (a, b) => b.reviewCount - a.reviewCount,
}

/** Apply `filters` to the catalogue and return the matches in sorted order. */
export function searchCafes(filters: Filters, cafes: Cafe[] = CAFES): Cafe[] {
  const matches = cafes.filter((cafe) => {
    if (!filters.intents.every((tag) => cafe.tags.includes(tag))) return false
    if (filters.openNow && !cafe.isOpen) return false
    if (filters.price && cafe.priceKey !== filters.price) return false
    if (filters.type && cafe.type !== filters.type) return false
    if (filters.hood && cafe.hood !== filters.hood) return false
    return true
  })

  return matches.sort(SORTERS[filters.sort])
}

/**
 * Turn a free-text query into filters. The prototype matched intents on a
 * six-character prefix so that «مناسب کار با لپ‌تاپ» would also fire on the
 * shorter «مناسب کار»; that behaviour is kept, since the home page links
 * deliberately use the short forms.
 */
export function filtersFromQuery(query: string): Pick<Filters, 'intents' | 'hood'> {
  if (!query) return { intents: [], hood: '' }

  const intents = INTENTS.filter((tag) => query.includes(tag.slice(0, 6)))
  const hood = HOODS.find((h) => query.includes(h)) ?? ''

  return { intents: [...intents], hood }
}

/** How many of the "advanced" (non-intent) filters are currently narrowing the list. */
export function countAdvanced(filters: Filters): number {
  return (
    (filters.price ? 1 : 0) +
    (filters.type ? 1 : 0) +
    (filters.hood ? 1 : 0) +
    (filters.sort !== 'rating' ? 1 : 0)
  )
}

/**
 * Order a venue's tags so the ones the user filtered on come first — those are
 * the two the result card highlights.
 */
export function tagsByRelevance(cafe: Cafe, selected: string[]): string[] {
  return [...cafe.tags].sort(
    (a, b) => Number(selected.includes(b)) - Number(selected.includes(a)),
  )
}
