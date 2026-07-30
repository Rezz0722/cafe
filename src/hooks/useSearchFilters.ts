import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { filtersFromQuery, type Filters } from '@/lib/search'
import { HOODS, INTENTS } from '@/data/taxonomy'
import type { PriceKey, SortKey, VenueType } from '@/types'

const SORT_KEYS: SortKey[] = ['rating', 'near', 'popular']
const PRICE_KEYS: PriceKey[] = ['cheap', 'mid', 'high']
const TYPE_KEYS: VenueType[] = ['کافه', 'کافه‌رستوران']

/** Only accept values we recognise — a hand-edited URL must not break the list. */
function oneOf<T extends string>(value: string | null, allowed: readonly T[]): T | '' {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : ''
}

export interface SearchState extends Filters {
  query: string
  view: 'list' | 'map'
}

/**
 * `intents` and `hood` can either be spelled out in the URL or inferred from the
 * free-text query — the home page's intent cards link here with only `?q=`.
 * Presence of the parameter, not its value, decides which wins: an empty
 * `intents=` means "the user cleared them", which inference must not undo.
 */
const INTENTS_PARAM = 'intents'
const HOOD_PARAM = 'hood'

/**
 * Search state lives in the URL rather than component state, so a filtered list
 * is shareable and the back button steps through filter changes. Filter edits
 * use `replace` to avoid stacking a history entry per chip tap.
 */
export function useSearchFilters(): {
  state: SearchState
  patch: (changes: Partial<SearchState>) => void
  clearFilters: () => void
} {
  const [params, setParams] = useSearchParams()

  const state = useMemo<SearchState>(() => {
    const query = params.get('q') ?? ''
    const derived = filtersFromQuery(query)

    const rawIntents = params.get(INTENTS_PARAM)
    const intents =
      rawIntents === null
        ? derived.intents
        : rawIntents
            .split(',')
            .filter((tag) => (INTENTS as readonly string[]).includes(tag))

    const rawHood = params.get(HOOD_PARAM)
    const hood = rawHood === null ? derived.hood : oneOf(rawHood, HOODS)

    return {
      query,
      intents,
      hood,
      openNow: params.get('open') === '1',
      price: oneOf(params.get('price'), PRICE_KEYS),
      type: oneOf(params.get('type'), TYPE_KEYS),
      sort: oneOf(params.get('sort'), SORT_KEYS) || 'rating',
      view: params.get('view') === 'map' ? 'map' : 'list',
    }
  }, [params])

  /**
   * Serialises the whole state, so `intents` and `hood` become explicit on the
   * first edit and stay that way — inference only ever applies to a URL the user
   * arrived on, never to one they have since changed.
   */
  const write = useCallback(
    (next: SearchState) => {
      const search = new URLSearchParams()

      if (next.query.trim()) search.set('q', next.query.trim())
      search.set(INTENTS_PARAM, next.intents.join(','))
      search.set(HOOD_PARAM, next.hood)
      if (next.openNow) search.set('open', '1')
      if (next.price) search.set('price', next.price)
      if (next.type) search.set('type', next.type)
      if (next.sort !== 'rating') search.set('sort', next.sort)
      if (next.view === 'map') search.set('view', 'map')

      setParams(search, { replace: true })
    },
    [setParams],
  )

  const patch = useCallback(
    (changes: Partial<SearchState>) => write({ ...state, ...changes }),
    [state, write],
  )

  const clearFilters = useCallback(() => {
    // The query itself is not a filter, so clearing must leave it alone.
    write({ query: state.query, view: state.view, intents: [], hood: '', openNow: false, price: '', type: '', sort: 'rating' })
  }, [state.query, state.view, write])

  return { state, patch, clearFilters }
}
