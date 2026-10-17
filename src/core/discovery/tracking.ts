export const HOME_DISCOVERY_EVENTS = [
  'nearby_search_started',
  'discovery_category_clicked',
  'food_category_selected',
  'review_card_opened',
  'cafe_detail_opened',
  'menu_opened_from_discovery',
] as const

export interface HomeDiscoveryEvent {
  event: typeof HOME_DISCOVERY_EVENTS[number]
  source: 'hero' | 'quick_discovery' | 'food_discovery' | 'district' | 'featured' | 'trusted_reviews'
  context: string
  placeId: number | null
}

const sources = new Set<HomeDiscoveryEvent['source']>([
  'hero', 'quick_discovery', 'food_discovery', 'district', 'featured', 'trusted_reviews',
])
const events = new Set<string>(HOME_DISCOVERY_EVENTS)

/** Never persist search terms, arbitrary text, contact data, or URL query strings. */
export function parseHomeDiscoveryEvent(input: unknown): HomeDiscoveryEvent | null {
  if (!input || typeof input !== 'object') return null
  const payload = input as Record<string, unknown>
  const event = payload.event
  const source = payload.source
  const context = payload.context
  if (typeof event !== 'string' || !events.has(event) || typeof source !== 'string' || !sources.has(source as HomeDiscoveryEvent['source'])) return null
  if (typeof context !== 'string' || !/^[a-z0-9_-]{1,48}$/.test(context)) return null
  const placeEvent = event === 'review_card_opened' || event === 'cafe_detail_opened' || event === 'menu_opened_from_discovery'
  const placeId = placeEvent ? Number(context) : null
  if (placeEvent && (!Number.isSafeInteger(placeId) || placeId! <= 0)) return null
  if (event === 'nearby_search_started' && (source !== 'hero' || context !== 'near_me')) return null
  if (event === 'review_card_opened' && source !== 'trusted_reviews') return null
  if ((event === 'cafe_detail_opened' || event === 'menu_opened_from_discovery') && source !== 'featured') return null
  if (event === 'food_category_selected' && !['quick_discovery', 'food_discovery'].includes(source)) return null
  if (event === 'discovery_category_clicked' && !['hero', 'quick_discovery', 'district'].includes(source)) return null
  return { event: event as HomeDiscoveryEvent['event'], source: source as HomeDiscoveryEvent['source'], context, placeId }
}
