/**
 * تبدیل رکورد خام مکان به نمای قابل نمایش.
 *
 * هر مقدار مشتق دقیقاً یک‌جا محاسبه می‌شود — همین‌جا. اگر صفحه‌ی جست‌وجو و
 * صفحه‌ی جزئیات هرکدام باز/بسته را جدا حساب کنند، بالاخره روزی با هم اختلاف
 * پیدا می‌کنند.
 */

import type { Coords, Place, PlaceView } from './types'
import { computeOpenState } from '@/core/hours/openState'
import { distanceKm } from '@/core/geo/distance'
import { bayesianAverage, rawAverage } from '@/core/rating/bayesian'
import { computeFreshnessScore, computeQualityScore } from '@/core/quality/scores'

export interface ViewContext {
  /** موقعیت کاربر — وقتی نداریم، فاصله null می‌ماند و سورت فاصله غیرفعال. */
  userCoords?: Coords | null
  siteMean?: number
  now?: Date
}

export function toPlaceView(place: Place, ctx: ViewContext = {}): PlaceView {
  const now = ctx.now ?? new Date()
  const open = computeOpenState(place.hours, place.hoursExceptions, now)

  return {
    ...place,
    rating: bayesianAverage(place.ratingSum, place.ratingCount, ctx.siteMean),
    rawRating: rawAverage(place.ratingSum, place.ratingCount),
    isOpenNow: open.isOpen,
    openLabel: open.label,
    openSubLabel: open.subLabel,
    distanceKm:
      ctx.userCoords && place.coords ? distanceKm(ctx.userCoords, place.coords) : null,
    qualityScore: computeQualityScore(place),
    freshnessScore: computeFreshnessScore(place, now),
    activeAttributeIds: place.attributes.filter((a) => a.value >= 1).map((a) => a.attributeId),
  }
}

export function toPlaceViews(places: Place[], ctx: ViewContext = {}): PlaceView[] {
  return places.map((p) => toPlaceView(p, ctx))
}
