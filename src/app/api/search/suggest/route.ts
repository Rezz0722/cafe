import { NextRequest, NextResponse } from 'next/server'
import { itemSlug } from '@/core/items/identity'
import { listMenuItemCards } from '@/core/items/queries'
import { getDishBySlug, listDistricts, listPlaceCards } from '@/core/places/queries'
import { searchPath } from '@/core/search/filters'
import { resolveProductIntent } from '@/core/search/resolveEntity'
import type { SearchSuggestion } from '@/core/search/suggestions'
import { FACET_BY_ID } from '@/core/taxonomy/menuTaxonomy'
import { normalizeFa } from '@/core/text/normalize'
import { paths } from '@/routes'

export const dynamic = 'force-dynamic'

/** پیشنهادهای کوتاه و نوع‌دار؛ نتیجهٔ کامل همچنان در /search رندر می‌شود. */
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get('q')?.trim().slice(0, 60) ?? ''
  const query = normalizeFa(raw)
  if (query.length < 2) return NextResponse.json({ suggestions: [] })

  const intent = resolveProductIntent(query)
  const dish = intent.kind === 'dish' ? await getDishBySlug(intent.dishSlug) : null
  // تشخیص دسته فقط دامنه را محدود می‌کند؛ خود متن هم باید روی نام آیتم اعمال
  // شود. بدون این شرط، جست‌وجوی «قهوه» آیتم‌های تصادفیِ همان دسته مثل چای کرک
  // را در autocomplete نشان می‌داد که برای کاربر «پیشنهاد مرتبط» محسوب نمی‌شود.
  const itemFilter = intent.kind === 'facet'
    ? { facetIds: intent.facetIds, query }
    : dish
      ? { dishId: dish.id, query }
      : { query }

  const [places, items, districts] = await Promise.all([
    listPlaceCards({ query, limit: 2, sort: 'quality' }),
    listMenuItemCards({ ...itemFilter, availableOnly: true, limit: 3 }),
    listDistricts(),
  ])
  const matchingDistricts = districts
    .filter((district) => district.placeCount > 0 && normalizeFa(district.name).includes(query))
    .slice(0, 2)

  const suggestions: SearchSuggestion[] = []
  if (dish) {
    suggestions.push({
      type: 'dish',
      label: dish.nameFa,
      meta: `مقایسه در ${dish.placeCount} کافه`,
      href: paths.dish(dish.slug),
    })
  } else if (intent.kind === 'facet') {
    const facet = FACET_BY_ID.get(intent.facetId)
    if (facet) {
      suggestions.push({
        type: 'facet',
        label: facet.labelFa,
        meta: 'دستهٔ آیتم‌های منو',
        href: searchPath({ scope: 'items', facets: intent.facetIds }),
      })
    }
  }

  for (const district of matchingDistricts) {
    suggestions.push({
      type: 'district',
      label: district.name,
      meta: `${district.placeCount} کافه و رستوران`,
      href: paths.district(district.slug),
    })
  }

  for (const place of places) {
    suggestions.push({
      type: 'place',
      label: place.name,
      meta: place.districtName ? `کافه · ${place.districtName}` : 'کافه',
      href: paths.cafe(place.slug),
    })
  }
  for (const item of items) {
    suggestions.push({
      type: 'item',
      label: item.name,
      meta: `آیتم منوی ${item.place.name}`,
      href: paths.item(item.publicId, itemSlug(item.name)),
    })
  }

  return NextResponse.json(
    // در موبایل این فهرست پیش‌نمایش است، نه خود صفحهٔ نتایج. سقف کوتاه باعث
    // می‌شود کاربر نتیجه‌های اصلی را گم نکند و با «مشاهده همه» ادامه دهد.
    { suggestions: suggestions.slice(0, 6) },
    { headers: { 'Cache-Control': 'private, no-store, max-age=0' } },
  )
}
