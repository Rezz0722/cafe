/**
 * لایه‌ی دسترسی به داده.
 *
 * صفحات هرگز مستقیم به منبع داده دست نمی‌زنند — همه‌چیز از این interface رد
 * می‌شود. این تنها چیزی است که اجازه می‌دهد امروز روی seed کار کنید و فردا
 * بدون دست‌زدن به هیچ صفحه‌ای به Postgres سوئیچ کنید.
 *
 * وضعیت فعلی: آداپتور seed فعال است (بدون نیاز به زیرساخت).
 * مسیر تولیدی: `DATABASE_URL` را ست کنید و آداپتور Postgres را وصل کنید —
 * جزئیات در docs/DATA_LAYER.md.
 */

import type { District, Place, PlaceView } from './types'
import type { ViewContext } from './view'
import { toPlaceView, toPlaceViews } from './view'
import { computeSiteMean } from '@/core/rating/bayesian'
import { DISTRICTS } from '@/data/districts'
import { readAllPlaces } from '@/data/placeStore'

export interface PlaceRepository {
  listPlaces(): Promise<Place[]>
  getPlaceBySlug(slug: string): Promise<Place | null>
  listDistricts(): Promise<District[]>
}

// ── آداپتور فایل ─────────────────────────────────────────────────────
// از `places.generated.json` (خروجی import) به‌علاوه‌ی `places.custom.json`
// (افزوده‌های پنل ادمین) می‌خواند. مسیر Postgres در docs/DATA_LAYER.md.

class FilePlaceRepository implements PlaceRepository {
  async listPlaces(): Promise<Place[]> {
    return readAllPlaces()
  }

  async getPlaceBySlug(slug: string): Promise<Place | null> {
    const all = await readAllPlaces()
    return all.find((p) => p.slug === slug) ?? null
  }

  async listDistricts(): Promise<District[]> {
    return DISTRICTS
  }
}

// ── انتخاب آداپتور ───────────────────────────────────────────────────

let repository: PlaceRepository = new FilePlaceRepository()

/** برای تست یا سوئیچ به Postgres. */
export function setRepository(next: PlaceRepository): void {
  repository = next
}

export function getRepository(): PlaceRepository {
  return repository
}

// ── توابع سطح‌بالا که صفحات استفاده می‌کنند ─────────────────────────

/**
 * همه‌ی مکان‌های منتشرشده، به‌صورت نما (با مقادیر مشتق).
 * `siteMean` یک‌بار برای کل مجموعه حساب می‌شود تا رتبه‌بندی بیزی سازگار بماند.
 */
export async function loadPlaceViews(ctx: Omit<ViewContext, 'siteMean'> = {}): Promise<
  PlaceView[]
> {
  const places = await repository.listPlaces()
  const siteMean = computeSiteMean(places)
  return toPlaceViews(places, { ...ctx, siteMean })
}

export async function loadPublishedViews(
  ctx: Omit<ViewContext, 'siteMean'> = {},
): Promise<PlaceView[]> {
  const all = await loadPlaceViews(ctx)
  return all.filter((p) => p.status === 'published')
}

export async function loadPlaceView(
  slug: string,
  ctx: Omit<ViewContext, 'siteMean'> = {},
): Promise<PlaceView | null> {
  const place = await repository.getPlaceBySlug(slug)
  if (!place) return null

  const all = await repository.listPlaces()
  return toPlaceView(place, { ...ctx, siteMean: computeSiteMean(all) })
}

export async function loadDistricts(): Promise<District[]> {
  return repository.listDistricts()
}

export async function loadDistrictBySlug(slug: string): Promise<District | null> {
  const districts = await repository.listDistricts()
  return districts.find((d) => d.slug === slug) ?? null
}
