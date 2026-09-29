/** قواعد خالصِ انتخاب قیمت‌هایی که نمایندهٔ هزینهٔ خوردن/نوشیدن در مکان‌اند. */

export interface PriceStatsPolicy {
  /** صفر یعنی سقف خودکار غیرفعال است. */
  maxItemPrice: number
  excludeServiceSections: boolean
}

export interface PriceStatsCandidate {
  price: number | null
  manuallyExcluded: boolean
  facetKind?: string | null
}

export function isEligibleForPriceStats(
  item: PriceStatsCandidate,
  policy: PriceStatsPolicy,
): item is PriceStatsCandidate & { price: number } {
  if (item.price === null || item.manuallyExcluded) return false
  if (policy.maxItemPrice > 0 && item.price > policy.maxItemPrice) return false
  if (policy.excludeServiceSections && item.facetKind === 'service') return false
  return true
}

export function pricesForPlaceStats(
  items: PriceStatsCandidate[],
  policy: PriceStatsPolicy,
): number[] {
  return items.filter((item) => isEligibleForPriceStats(item, policy)).map((item) => item.price)
}
