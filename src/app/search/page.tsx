import type { Metadata } from 'next'
import { inArray } from 'drizzle-orm'
import { SearchView } from '@/components/search/SearchView'
import { computeOpenState } from '@/core/hours/openNow'
import { getMapLabels } from '@/core/map/labels'
import {
  countPlaces,
  getDishBySlug,
  listCardsWithDishPrice,
  listDistricts,
  listFilterFacets,
  listPlaceCards,
  listPopularDishes,
} from '@/core/places/queries'
import { describeFilters, parseFilters } from '@/core/search/filters'
import { getDb } from '@/db/client'
import { placeHours } from '@/db/schema'

/**
 * صفحه‌ی کشف و جست‌وجو.
 *
 * ═══ چرا فیلتر «الان باز» در SQL نیست ═══
 *
 * «باز بودن» به لحظه‌ی حال، منطقه‌ی زمانی و شیفت شکسته بستگی دارد. نوشتنش در
 * SQL یعنی تکرار منطقِ `openNow.ts` در دو زبان — و دو پیاده‌سازی از یک قاعده
 * همیشه از هم می‌افتند. اینجا ساعت‌ها یک‌جا خوانده و با همان تابعِ **تست‌شده**
 * فیلتر می‌شوند. برای ۳۳۱ مکان هزینه‌اش ناچیز است.
 *
 * ═══ چرا مرتب‌سازی فاصله در کلاینت است ═══
 *
 * موقعیت کاربر فقط در مرورگر هست. سرور نتایج را با رتبه‌بندی معمول می‌دهد و
 * `SearchView` بعد از گرفتن اجازه‌ی موقعیت، همان‌ها را با فاصله مرتب می‌کند.
 */

const PAGE_SIZE = 24

type SearchParams = Promise<Record<string, string | string[] | undefined>>

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams
}): Promise<Metadata> {
  const filters = parseFilters(await searchParams)
  const [facets, dishes, districts] = await Promise.all([
    listFilterFacets(),
    listPopularDishes(),
    listDistricts(),
  ])

  const heading = describeFilters(filters, {
    facetLabel: (id) => facets.find((facet) => facet.id === id)?.labelFa,
    dishLabel: (slug) => dishes.find((dish) => dish.slug === slug)?.nameFa,
    districtLabel: (id) => districts.find((district) => district.id === id)?.name,
  })

  return {
    title: `${heading} — کافه‌گرد`,
    description: `${heading}. فیلتر بر اساس قیمت واقعی منو، محله، دسته و فاصله.`,
    // صفحه‌ی نتیجه با فیلترِ آزاد ایندکس نمی‌شود: ترکیب فیلترها بی‌نهایت URL
    // می‌سازد و همه‌شان محتوای تقریباً یکسان دارند. صفحات محله مسیر کانونی‌اند.
    robots: { index: false, follow: true },
  }
}

export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  const filters = parseFilters(await searchParams)

  const [facets, popularDishes, districts] = await Promise.all([
    listFilterFacets(),
    listPopularDishes(),
    listDistricts(),
  ])

  const dish = filters.dish ? await getDishBySlug(filters.dish) : null

  const queryFilters = {
    facetIds: filters.facets,
    districtId: filters.districtId,
    priceTiers: filters.tiers.length ? filters.tiers : undefined,
    maxPrice: filters.maxPrice,
    query: filters.q || null,
    // «نزدیک من» و نمای نقشه بدون مختصات بی‌معنی‌اند.
    mappableOnly: filters.nearMe || filters.view === 'map',
    // مرتب‌سازی فاصله در کلاینت انجام می‌شود، پس سرور رتبه‌ی معمول می‌دهد.
    sort: filters.sort === 'distance' ? ('rating' as const) : filters.sort,
    // فیلتر «باز است» بعد از پرس‌وجو اعمال می‌شود، پس باید بیشتر بگیریم و
    // صفحه‌بندی را خودمان انجام دهیم.
    limit: filters.openNow ? 400 : PAGE_SIZE,
    offset: filters.openNow ? 0 : (filters.page - 1) * PAGE_SIZE,
  }

  let cards: Awaited<ReturnType<typeof listCardsWithDishPrice>> | Awaited<
    ReturnType<typeof listPlaceCards>
  > = dish
    ? await listCardsWithDishPrice(dish.id, queryFilters)
    : await listPlaceCards(queryFilters)

  let total = filters.openNow ? cards.length : await countPlaces(queryFilters)

  if (filters.openNow && cards.length > 0) {
    const db = getDb()
    const hourRows = await db
      .select()
      .from(placeHours)
      .where(
        inArray(
          placeHours.placeId,
          cards.map((card) => card.id),
        ),
      )

    const byPlace = new Map<number, typeof hourRows>()
    for (const row of hourRows) {
      const list = byPlace.get(row.placeId)
      if (list) list.push(row)
      else byPlace.set(row.placeId, [row])
    }

    cards = cards.filter((card) => {
      const shifts = byPlace.get(card.id) ?? []
      // ساعت نامشخص یعنی نمی‌توانیم بگوییم باز است. حذفش صادقانه‌تر از
      // نشان‌دادنش زیر برچسب «الان باز» است.
      if (shifts.length === 0) return false
      return (
        computeOpenState(
          shifts.map((shift) => ({
            dow: shift.dow,
            shiftIndex: shift.shiftIndex,
            opensAt: shift.opensAt ? shift.opensAt.slice(0, 5) : null,
            closesAt: shift.closesAt ? shift.closesAt.slice(0, 5) : null,
            crossesMidnight: shift.crossesMidnight,
            closed: shift.closed,
          })),
        ).status === 'open'
      )
    })

    total = cards.length
    const start = (filters.page - 1) * PAGE_SIZE
    cards = cards.slice(start, start + PAGE_SIZE)
  }

  const heading = describeFilters(filters, {
    facetLabel: (id) => facets.find((facet) => facet.id === id)?.labelFa,
    dishLabel: (slug) => popularDishes.find((item) => item.slug === slug)?.nameFa,
    districtLabel: (id) => districts.find((district) => district.id === id)?.name,
  })

  const subheading = dish
    ? `${dish.placeCount.toLocaleString('fa-IR')} مجموعه ${dish.nameFa} دارند` +
      (dish.minPrice ? ` · ارزان‌ترین ${dish.minPrice.toLocaleString('fa-IR')} تومان` : '')
    : `${total.toLocaleString('fa-IR')} مجموعه`

  return (
    <SearchView
      filters={filters}
      cards={cards}
      total={total}
      pageSize={PAGE_SIZE}
      heading={heading}
      subheading={subheading}
      facets={facets.map((facet) => ({
        id: facet.id,
        labelFa: facet.labelFa,
        icon: facet.icon,
        placeCount: facet.placeCount,
      }))}
      dishes={popularDishes.map((item) => ({
        slug: item.slug,
        nameFa: item.nameFa,
        placeCount: item.placeCount,
      }))}
      districts={districts.map((district) => ({
        id: district.id,
        name: district.name,
        placeCount: district.placeCount,
      }))}
      labels={getMapLabels({ zoom: 12, limit: 30 })}
    />
  )
}
