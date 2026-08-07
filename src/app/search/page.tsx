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
import { parseSearchQuery } from '@/core/search/parseQuery'
import { attributeLabel } from '@/core/taxonomy/attributes'
import { MaintenanceScreen } from '@/components/site/MaintenanceScreen'
import { maintenanceState } from '@/core/settings/maintenance'
import { getDiscoveryPolicy, getLocalePolicy, getMapPolicy } from '@/core/settings/policies'
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
    // برچسب ویژگی از واژگانِ کد می‌آید نه از دیتابیس: `ATTRIBUTES` مرجع است و
    // جدول `attribute` از همان seed می‌شود، پس یک پرس‌وجوی اضافه لازم نیست.
    attributeLabel,
    dishLabel: (slug) => dishes.find((dish) => dish.slug === slug)?.nameFa,
    districtLabel: (id) => districts.find((district) => district.id === id)?.name,
  })

  return {
    title: heading,
    description: `${heading}. فیلتر بر اساس قیمت واقعی منو، محله، دسته و فاصله.`,
    // صفحه‌ی نتیجه با فیلترِ آزاد ایندکس نمی‌شود: ترکیب فیلترها بی‌نهایت URL
    // می‌سازد و همه‌شان محتوای تقریباً یکسان دارند. صفحات محله مسیر کانونی‌اند.
    robots: { index: false, follow: true },
  }
}

export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  const gate = await maintenanceState()
  if (gate.closed) {
    return <MaintenanceScreen siteName={gate.siteName} message={gate.message} />
  }

  const filters = parseFilters(await searchParams)

  const [facets, popularDishes, districts, discovery, locale, map] = await Promise.all([
    listFilterFacets(),
    listPopularDishes(),
    listDistricts(),
    getDiscoveryPolicy(),
    getLocalePolicy(),
    getMapPolicy(),
  ])

  const pageSize = discovery.pageSize

  const dish = filters.dish ? await getDishBySlug(filters.dish) : null

  /*
    پیش‌پردازش کوئری — قبل از رسیدن به دیتابیس.

    «کافه‌ای در احمد آباد» تا امروز کل متن را به `MATCH … AGAINST` می‌داد:
    «کافه» در نام اکثر مجموعه‌ها هست پس همه امتیاز می‌گرفتند، و منطقه هیچ‌وقت
    به شرطِ `WHERE district_id` تبدیل نمی‌شد — نتیجه‌اش این بود که کافه‌های
    وکیل‌آباد بالاتر از کافه‌های خودِ احمدآباد می‌آمدند.

    فیلترِ صریحِ کاربر (`?d=…` از نوار کنار) اولویت دارد: اگر خودش منطقه‌ای
    انتخاب کرده، حدسِ ما نباید رویش بنویسد.
  */
  const parsed = filters.rawQuery
    ? // `?raw=1` یعنی کاربر صریحاً گفته «متن را همان‌طور که نوشتم جست‌وجو کن».
      { districtId: null, district: null, text: filters.q.trim(), changed: false }
    : parseSearchQuery(filters.q, districts)
  const effectiveDistrictId = filters.districtId ?? parsed.districtId
  const effectiveQuery = parsed.text || null

  const queryFilters = {
    facetIds: filters.facets,
    attributeIds: filters.attributes,
    districtId: effectiveDistrictId,
    priceTiers: filters.tiers.length ? filters.tiers : undefined,
    maxPrice: filters.maxPrice,
    query: effectiveQuery,
    // «نزدیک من» و نمای نقشه بدون مختصات بی‌معنی‌اند.
    mappableOnly: filters.nearMe || filters.view === 'map',
    // مرتب‌سازی فاصله در کلاینت انجام می‌شود، پس سرور رتبه‌ی معمول می‌دهد.
    sort: filters.sort === 'distance' ? ('rating' as const) : filters.sort,
    // فیلتر «باز است» بعد از پرس‌وجو اعمال می‌شود، پس باید بیشتر بگیریم و
    // صفحه‌بندی را خودمان انجام دهیم.
    limit: filters.openNow ? 400 : pageSize,
    offset: filters.openNow ? 0 : (filters.page - 1) * pageSize,
  }

  let cards: Awaited<ReturnType<typeof listCardsWithDishPrice>> | Awaited<
    ReturnType<typeof listPlaceCards>
  > = dish
    ? await listCardsWithDishPrice(dish.id, queryFilters)
    : await listPlaceCards(queryFilters)

  let total = filters.openNow ? cards.length : await countPlaces(queryFilters)

  /*
    باقی‌ماندهٔ متن، صفت است نه نام — پس نباید نتیجه را صفر کند.

    «یه کافه خوب نزدیک وکیل آباد میخوام» منطقه را درست تشخیص می‌دهد ولی «خوب»
    از فیلترِ کلمات توقف رد می‌شود (چون ممکن است نام یک کافه باشد) و بعد
    `MATCH … AGAINST` روی آن صفر نتیجه می‌دهد. کاربر منطقه‌ی درست را گفته و
    صفحه‌ی خالی می‌گیرد.

    فهرست کلمات توقف را بزرگ‌تر نمی‌کنیم — آن راه بی‌پایان است و هر صفتی که
    اضافه شود، کافه‌ای با همان نام را برای همیشه غیرقابل‌جست‌وجو می‌کند. به‌جایش:
    اگر منطقه از متن تشخیص داده شده و نتیجه خالی است، متن را کنار می‌گذاریم و
    منطقه را نگه می‌داریم — و به کاربر می‌گوییم که این کار را کردیم.

    هزینه‌اش یک پرس‌وجوی اضافه، فقط در همین حالتِ خالی.
  */
  let ignoredText: string | null = null
  if (cards.length === 0 && parsed.district && parsed.text && !dish) {
    const relaxed = { ...queryFilters, query: null }
    const retry = await listPlaceCards(relaxed)
    if (retry.length > 0) {
      cards = retry
      total = filters.openNow ? retry.length : await countPlaces(relaxed)
      ignoredText = parsed.text
    }
  }

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
          new Date(),
          locale.timeZone,
        ).status === 'open'
      )
    })

    total = cards.length
    const start = (filters.page - 1) * pageSize
    cards = cards.slice(start, start + pageSize)
  }

  /*
    عنوان از فیلترهای **مؤثر** ساخته می‌شود، نه از فیلترهای خام: کاربری که
    «کافه‌ای در احمد آباد» نوشته باید عنوانِ «کافه‌های مشهد در احمدآباد» را
    ببیند، نه «جست‌وجوی «کافه‌ای در احمد آباد»» که هیچ نمی‌گوید چه شد.
  */
  const heading = describeFilters(
    {
      ...filters,
      // متنی که نادیده گرفته شد نباید در عنوان بیاید: «جست‌وجوی «خوب» در
      // وکیل‌آباد» ادعا می‌کند «خوب» اعمال شده، در حالی که همان لحظه کنار
      // گذاشته شده و عنوان با نتیجه نمی‌خواند.
      q: ignoredText ? '' : parsed.text,
      districtId: effectiveDistrictId,
    },
    {
      facetLabel: (id) => facets.find((facet) => facet.id === id)?.labelFa,
      attributeLabel,
      dishLabel: (slug) => popularDishes.find((item) => item.slug === slug)?.nameFa,
      districtLabel: (id) => districts.find((district) => district.id === id)?.name,
    },
  )

  const subheading = dish
    ? `${dish.placeCount.toLocaleString('fa-IR')} مجموعه ${dish.nameFa} دارند` +
      (dish.minPrice ? ` · ارزان‌ترین ${dish.minPrice.toLocaleString('fa-IR')} تومان` : '')
    : `${total.toLocaleString('fa-IR')} مجموعه`

  return (
    <SearchView
      filters={filters}
      cards={cards}
      total={total}
      pageSize={pageSize}
      priceCaps={discovery.priceCaps}
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
      // فقط تشخیصِ *ما* اعلام می‌شود، نه فیلتری که خودِ کاربر از نوار کنار زده —
      // آن یکی را خودش می‌بیند و توضیح لازم ندارد.
      detectedDistrict={
        !filters.districtId && parsed.district
          ? { id: parsed.district.id, name: parsed.district.name }
          : null
      }
      ignoredText={ignoredText}
      labels={getMapLabels({ zoom: map.defaultZoom, limit: 30 })}
      mapConfig={{
        center: map.center,
        zoom: map.defaultZoom,
        minZoom: map.minZoom,
        maxZoom: map.maxZoom,
      }}
    />
  )
}
