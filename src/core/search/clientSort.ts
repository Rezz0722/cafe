import type { SortKey } from './filters'

export interface LocatedCard {
  id: number
  coords: { lat: number; lng: number } | null
  distanceKm?: number | null
}

/** فاصلهٔ مستقیم؛ در UI صریحاً «فاصله مستقیم» نامیده می‌شود، نه مسیر. */
export function directDistanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const radiusKm = 6371
  const toRad = (degrees: number) => (degrees * Math.PI) / 180
  const deltaLat = toRad(b.lat - a.lat)
  const deltaLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(deltaLat / 2) ** 2 +
    Math.sin(deltaLng / 2) ** 2 * Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat))
  return 2 * radiusKm * Math.asin(Math.sqrt(h))
}

/**
 * همهٔ نامزدها را فاصله‌دار می‌کند؛ فقط برای sort=distance مرتب می‌کند.
 * در مرتب‌سازی فاصله، id آخرین tie-breaker است تا Pagination با دو فاصلهٔ
 * برابر، آیتم تکراری یا گمشده نسازد. ترتیب سایر حالت‌ها از سرور حفظ می‌شود.
 */
export function sortCardsByDistance<T extends LocatedCard>(
  cards: T[],
  origin: { lat: number; lng: number },
  sort: SortKey = 'distance',
): (T & { distanceKm: number | null })[] {
  const withDistance = cards.map((card) => ({
    ...card,
    distanceKm: card.coords ? directDistanceKm(origin, card.coords) : null,
  }))
  if (sort !== 'distance') return withDistance
  return withDistance.sort((a, b) => {
    if (a.distanceKm === null && b.distanceKm === null) return a.id - b.id
    if (a.distanceKm === null) return 1
    if (b.distanceKm === null) return -1
    return a.distanceKm - b.distanceKm || a.id - b.id
  })
}

/** فاصلهٔ آیتم با مختصات شعبهٔ مالک؛ ترتیب سرور مگر برای sort=distance. */
export function sortItemsByDistance<T extends { id: number; place: LocatedCard }>(
  items: T[],
  origin: { lat: number; lng: number },
  sort: SortKey = 'distance',
): (T & { distanceKm: number | null })[] {
  const withDistance = items.map((item) => ({
    ...item,
    distanceKm: item.place.coords ? directDistanceKm(origin, item.place.coords) : null,
  }))
  if (sort !== 'distance') return withDistance
  return withDistance.sort((a, b) => {
    if (a.distanceKm === null && b.distanceKm === null) return a.id - b.id
    if (a.distanceKm === null) return 1
    if (b.distanceKm === null) return -1
    return a.distanceKm - b.distanceKm || a.id - b.id
  })
}

export function pageSlice<T>(items: T[], page: number, pageSize: number): T[] {
  const start = Math.max(0, page - 1) * pageSize
  return items.slice(start, start + pageSize)
}
