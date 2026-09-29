/**
 * تشخیص نوع موجودیت برای متن آزاد جست‌وجو.
 *
 * این تابع عمداً pure و deterministic است. نام کافه در مرحلهٔ بعد و با
 * دیتابیس سنجیده می‌شود؛ اینجا فقط واژگان محصول را می‌شناسیم. بنابراین
 * «قهوه» و «پاستا» هرگز دوباره به‌عنوان نام کافه تفسیر نمی‌شوند.
 */
import { DISHES, DISH_BY_SLUG, FACETS, matchDish, matchFacet } from '@/core/taxonomy/menuTaxonomy'
import { normalizeFa } from '@/core/text/normalize'
import { closestFuzzy } from './fuzzy'

export type ProductIntent =
  | { kind: 'dish'; dishSlug: string; dishName: string; facetId: string }
  | { kind: 'facet'; facetId: string; facetIds: string[] }
  | { kind: 'unknown' }

export interface ProductQueryParts {
  intent: ProductIntent
  /** متن باقی‌مانده بعد از حذف نام غذا/دسته؛ معمولاً نام کافه است. */
  placeQuery: string
}

/** خانواده‌هایی که در زبان کاربر یک مفهوم‌اند ولی در منو برای فیلتر دقیق جدا شده‌اند. */
const FACET_FAMILIES: Record<string, string[]> = {
  coffee: ['coffee', 'cold_coffee', 'brewed_coffee'],
}

export function resolveProductIntent(query: string): ProductIntent {
  const value = query.trim()
  if (!value) return { kind: 'unknown' }

  const dishSlug = matchDish(value)
  if (dishSlug) {
    const dish = DISH_BY_SLUG.get(dishSlug)
    if (dish) {
      return {
        kind: 'dish',
        dishSlug: dish.slug,
        dishName: dish.nameFa,
        facetId: dish.facetId,
      }
    }
  }

  const facetId = matchFacet(value)
  if (facetId) {
    return { kind: 'facet', facetId, facetIds: FACET_FAMILIES[facetId] ?? [facetId] }
  }

  // فقط پس از شکست تطابق قطعی و با حداکثر دو ویرایش. این مسیر غلط‌های رایج
  // مثل «پاستاا» را می‌گیرد ولی روی عبارت مبهم حدس نمی‌زند.
  const fuzzyDishSlug = closestFuzzy(
    value,
    DISHES.map((item) => ({ value: item.slug, terms: [item.nameFa, item.nameEn ?? '', ...item.aliases] })),
  )
  if (fuzzyDishSlug) {
    const dish = DISH_BY_SLUG.get(fuzzyDishSlug)
    if (dish) return { kind: 'dish', dishSlug: dish.slug, dishName: dish.nameFa, facetId: dish.facetId }
  }
  const fuzzyFacetId = closestFuzzy(
    value,
    FACETS.filter((item) => item.isFilter).map((item) => ({ value: item.id, terms: [item.labelFa, item.labelEn] })),
  )
  return fuzzyFacetId
    ? { kind: 'facet', facetId: fuzzyFacetId, facetIds: FACET_FAMILIES[fuzzyFacetId] ?? [fuzzyFacetId] }
    : { kind: 'unknown' }
}

/** عبارت ترکیبی «غذا + کافه» را به دو شرط مستقل تبدیل می‌کند. */
export function splitProductAndPlaceQuery(query: string): ProductQueryParts {
  const normalized = normalizeFa(query).trim()
  if (!normalized) return { intent: { kind: 'unknown' }, placeQuery: '' }

  const dishTerms = DISHES.flatMap((dish) =>
    [dish.nameFa, dish.nameEn ?? '', ...dish.aliases]
      .map((term) => normalizeFa(term).trim())
      .filter(Boolean)
      .map((term) => ({ term, intent: { kind: 'dish' as const, dishSlug: dish.slug, dishName: dish.nameFa, facetId: dish.facetId } })),
  )
  const facetTerms = FACETS.filter((facet) => facet.isFilter).flatMap((facet) =>
    [facet.labelFa, facet.labelEn]
      .map((term) => normalizeFa(term).trim())
      .filter(Boolean)
      .map((term) => ({ term, intent: { kind: 'facet' as const, facetId: facet.id, facetIds: FACET_FAMILIES[facet.id] ?? [facet.id] } })),
  )
  const candidates = [...dishTerms, ...facetTerms].sort((a, b) => b.term.length - a.term.length)
  const padded = ` ${normalized} `
  const match = candidates.find((candidate) => padded.includes(` ${candidate.term} `))
  if (!match) return { intent: resolveProductIntent(query), placeQuery: '' }

  return {
    intent: match.intent,
    placeQuery: padded.replace(` ${match.term} `, ' ').trim().replace(/\s+/g, ' '),
  }
}

export function effectiveSearchScope(
  requested: 'all' | 'places' | 'items',
  intent: ProductIntent,
): 'places' | 'items' {
  if (requested !== 'all') return requested
  return intent.kind === 'unknown' ? 'places' : 'items'
}
