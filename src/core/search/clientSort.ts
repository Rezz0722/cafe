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
 * همهٔ نامزدها را فاصله‌دار و پایدار مرتب می‌کند. id آخرین tie-breaker است تا
 * Pagination با دو فاصلهٔ برابر، آیتم تکراری یا گمشده نسازد.
 */
export function sortCardsByDistance<T extends LocatedCard>(
  cards: T[],
  origin: { lat: number; lng: number },
): (T & { distanceKm: number | null })[] {
  return cards
    .map((card) => ({
      ...card,
      distanceKm: card.coords ? directDistanceKm(origin, card.coords) : null,
    }))
    .sort((a, b) => {
      if (a.distanceKm === null && b.distanceKm === null) return a.id - b.id
      if (a.distanceKm === null) return 1
      if (b.distanceKm === null) return -1
      return a.distanceKm - b.distanceKm || a.id - b.id
    })
}

/** مرتب‌سازی نتایج آیتم منو با مختصات شعبهٔ مالک همان آیتم. */
export function sortItemsByDistance<T extends { id: number; place: LocatedCard }>(
  items: T[],
  origin: { lat: number; lng: number },
): (T & { distanceKm: number | null })[] {
  return items
    .map((item) => ({
      ...item,
      distanceKm: item.place.coords ? directDistanceKm(origin, item.place.coords) : null,
    }))
    .sort((a, b) => {
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
