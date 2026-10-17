import type { PlaceCard } from '@/core/places/queries'

export interface HomeRecommendation {
  card: PlaceCard
  reason: string
}

/** Existing quality ranking is the source order. This layer only adds an
 * explainable reason and avoids filling the homepage with one district. */
export function pickHomeRecommendations(cards: PlaceCard[], limit = 4): HomeRecommendation[] {
  const candidates = cards.flatMap((card): HomeRecommendation[] => {
    const reason = card.ratingCount >= 2
      ? `${card.ratingCount.toLocaleString('fa-IR')} تجربهٔ تأییدشده`
      : card.priceMedian !== null
        ? 'قیمت‌های منو ثبت شده'
        : card.facetIds.length > 0
          ? 'منوی دسته‌بندی‌شده'
          : null
    return reason ? [{ card, reason }] : []
  })
  const chosen: HomeRecommendation[] = []
  const usedDistricts = new Set<string>()
  for (const candidate of candidates) {
    const district = candidate.card.districtId
    if (!district || usedDistricts.has(district)) continue
    chosen.push(candidate)
    usedDistricts.add(district)
    if (chosen.length >= limit) return chosen
  }
  for (const candidate of candidates) {
    if (chosen.some((item) => item.card.id === candidate.card.id)) continue
    chosen.push(candidate)
    if (chosen.length >= limit) break
  }
  return chosen
}
