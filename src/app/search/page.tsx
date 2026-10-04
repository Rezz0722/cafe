import type { Metadata } from 'next'
import { inArray } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { SearchView } from '@/components/search/SearchView'
import { computeOpenState } from '@/core/hours/openNow'
import { trackSearch } from '@/core/analytics/track'
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
import { buildQuery, describeFilters, parseFilters } from '@/core/search/filters'
import { parseSearchQuery } from '@/core/search/parseQuery'
import { attributeLabel } from '@/core/taxonomy/attributes'
import { MaintenanceScreen } from '@/components/site/MaintenanceScreen'
import { maintenanceState } from '@/core/settings/maintenance'
import { getDiscoveryPolicy, getLocalePolicy, getMapPolicy } from '@/core/settings/policies'
import { getDb } from '@/db/client'
import { placeHours } from '@/db/schema'
import { normalizePlaceName, toAsciiDigits } from '@/core/text/normalize'
import { countMenuItems, listMenuItemCards } from '@/core/items/queries'
import { effectiveSearchScope, resolveProductIntent, splitProductAndPlaceQuery } from '@/core/search/resolveEntity'
import { fuzzyMatches } from '@/core/search/fuzzy'

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

/**
 * متن آزادِ جست‌وجو برای تحلیلِ صفرنتیجه مفید است، اما نباید شماره، ایمیل
 * یا لینکی را که کاربر اتفاقی در کادر نوشته برای همیشه در لاگ نگه داریم.
 */
function privacySafeQuery(raw: string): string {
  return toAsciiDigits(raw)
    .replace(/https?:\/\/\S+/gi, '[لینک]')
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[ایمیل]')
    .replace(/(?:\+?98|0098|0)?9\d{9}/g, '[شماره]')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
}

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

  const parsed = filters.rawQuery
    ? { text: filters.q.trim() }
    : parseSearchQuery(filters.q, districts)
  const productParts = splitProductAndPlaceQuery(parsed.text)
  const productIntent = productParts.intent
  const productPlaceQuery = productParts.placeQuery || null
  const itemResults = filters.scope === 'items'
    || (filters.scope === 'all' && (Boolean(filters.dish) || productIntent.kind !== 'unknown'))
  const entityHeading = itemResults
    ? filters.q.trim()
      ? `آیتم‌های منو برای «${filters.q.trim()}»`
      : filters.dish
        ? `آیتم‌های ${dishes.find((dish) => dish.slug === filters.dish)?.nameFa ?? 'منو'}`
        : 'جست‌وجوی آیتم‌های منو'
    : heading

  return {
    title: entityHeading,
    description: `${entityHeading}. فیلتر بر اساس قیمت واقعی منو، محله، دسته و فاصله.`,
    // صفحه‌ی نتیجه با فیلترِ آزاد ایندکس نمی‌شود: ترکیب فیلترها بی‌نهایت URL
    // می‌سازد و همه‌شان محتوای تقریباً یکسان دارند. صفحات محله مسیر کانونی‌اند.
    robots: { index: false, follow: true },
    // نتایج جست‌وجو معادل صفحهٔ اصلی نیستند؛ canonical موروثی را حذف کن.
    alternates: { canonical: null },
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
  // نقشه و «نزدیک من» باید کل مجموعهٔ کاندیداها را داشته باشند. مرتب‌کردن
  // فقط ۲۴ نتیجهٔ اول بر اساس فاصله، نزدیک‌ترین‌های جعلی تولید می‌کرد.
  const needsCompletePlaceSet = filters.nearMe || filters.view === 'map' || filters.openNow

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
  const productParts = splitProductAndPlaceQuery(parsed.text)
  const productIntent = productParts.intent
  const productPlaceQuery = productParts.placeQuery || null
  let effectiveScope = effectiveSearchScope(filters.scope, productIntent)
  if (filters.scope === 'all' && filters.dish) effectiveScope = 'items'
  const resolvedDishSlug = filters.dish ??
    (productIntent.kind === 'dish' ? productIntent.dishSlug : null)
  const dish = resolvedDishSlug ? await getDishBySlug(resolvedDishSlug) : null

  const queryFilters = {
    facetIds: filters.facets,
    attributeIds: filters.attributes,
    districtId: effectiveDistrictId,
    priceTiers: filters.tiers.length ? filters.tiers : undefined,
    maxPrice: filters.maxPrice,
    query: effectiveQuery,
    // «نزدیک من» و نمای نقشه بدون مختصات بی‌معنی‌اند.
    // نقشه، نتیجهٔ بی‌مختصات را پنهان نمی‌کند؛ پایین نقشه نسبت پوشش را می‌گوید.
    // فقط «نزدیک من» ذاتاً به مختصات معتبر نیاز دارد.
    mappableOnly: filters.nearMe,
    // مرتب‌سازی فاصله در کلاینت انجام می‌شود، پس سرور رتبه‌ی معمول می‌دهد.
    sort: filters.sort === 'distance' ? ('rating' as const) : filters.sort,
    // فیلتر «باز است» بعد از پرس‌وجو اعمال می‌شود، پس باید بیشتر بگیریم و
    // صفحه‌بندی را خودمان انجام دهیم.
    limit: needsCompletePlaceSet ? 600 : pageSize,
    offset: needsCompletePlaceSet ? 0 : (filters.page - 1) * pageSize,
  }

  let cards: Awaited<ReturnType<typeof listCardsWithDishPrice>> | Awaited<
    ReturnType<typeof listPlaceCards>
  > = []
  let itemCards: Awaited<ReturnType<typeof listMenuItemCards>> = []
  let total = 0

  const itemFilters = {
    query:
      productIntent.kind === 'unknown' && !dish && filters.facets.length === 0
        ? effectiveQuery
        : null,
    dishId: dish?.id ?? null,
    placeQuery: productPlaceQuery,
    facetIds:
      filters.facets.length > 0
        ? filters.facets
        : productIntent.kind === 'facet'
          ? productIntent.facetIds
          : undefined,
    districtId: effectiveDistrictId,
    maxPrice: filters.maxPrice,
    sort: filters.sort,
    // موقعیت فقط در مرورگر داریم؛ برای مرتب‌سازی دقیق، نامزدهای بیشتری
    // می‌گیریم و بعد از محاسبهٔ فاصله در کلاینت صفحه‌بندی می‌کنیم.
    limit: filters.nearMe ? 600 : pageSize,
    offset: filters.nearMe ? 0 : (filters.page - 1) * pageSize,
  }

  if (effectiveScope === 'items') {
    ;[itemCards, total] = await Promise.all([
      listMenuItemCards(itemFilters),
      countMenuItems(itemFilters),
    ])
  } else {
    cards = dish
      ? await listCardsWithDishPrice(dish.id, queryFilters)
      : await listPlaceCards(queryFilters)
    total = filters.openNow || needsCompletePlaceSet ? cards.length : await countPlaces(queryFilters)
  }

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
  let fuzzyPlaceMatch = false
  if (effectiveScope === 'places' && cards.length === 0 && parsed.district && parsed.text && !dish) {
    const relaxed = { ...queryFilters, query: null }
    const retry = await listPlaceCards(relaxed)
    if (retry.length > 0) {
      cards = retry
      total = filters.openNow || needsCompletePlaceSet ? retry.length : await countPlaces(relaxed)
      ignoredText = parsed.text
    }
  }

  // تحمل غلط املایی نام کافه فقط بعد از صفرنتیجه و با یک/دو ویرایش اجرا
  // می‌شود. چند شعبهٔ یک برند با هم برمی‌گردند؛ حدس مبهم گسترده پذیرفته نیست.
  if (
    effectiveScope === 'places' &&
    cards.length === 0 &&
    Boolean(effectiveQuery) &&
    productIntent.kind === 'unknown'
  ) {
    const candidates = await listPlaceCards({
      ...queryFilters,
      query: null,
      limit: 600,
      offset: 0,
    })
    const matches = fuzzyMatches(
      effectiveQuery!,
      candidates.map((card) => {
        const normalized = normalizePlaceName(card.name)
        return {
          value: card.id,
          terms: [normalized, ...normalized.split(' ').filter((word) => word.length >= 4), card.nameEn ?? ''],
        }
      }),
    )
    if (matches.length > 0) {
      const bestDistance = matches[0]!.distance
      const ids = new Set(matches.filter((match) => match.distance === bestDistance).map((match) => match.value))
      cards = candidates.filter((card) => ids.has(card.id))
      total = cards.length
      fuzzyPlaceMatch = true
    }
  }

  /*
    متن ناشناخته ممکن است نامِ اختصاصی یک محصول باشد، نه واژهٔ taxonomy.
    در حالت خودکار فقط وقتی هیچ Place پیدا نشده به آیتم‌ها fallback می‌کنیم؛
    بنابراین نام واقعی کافه هیچ‌وقت زیر نویز نام‌های منو دفن نمی‌شود.
  */
  if (
    effectiveScope === 'places' &&
    filters.scope === 'all' &&
    total === 0 &&
    Boolean(effectiveQuery) &&
    productIntent.kind === 'unknown'
  ) {
    const fallbackTotal = await countMenuItems(itemFilters)
    if (fallbackTotal > 0) {
      effectiveScope = 'items'
      itemCards = await listMenuItemCards(itemFilters)
      total = fallbackTotal
      ignoredText = null
    }
  }

  // وضعیت ساعت روی خود کارت هم نمایش داده می‌شود. همهٔ ساعت‌ها در یک query
  // خوانده می‌شوند تا فهرست به N+1 تبدیل نشود.
  if (effectiveScope === 'places' && cards.length > 0) {
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

    const openStates = new Map<number, ReturnType<typeof computeOpenState>>()
    for (const card of cards) {
      const shifts = byPlace.get(card.id) ?? []
      openStates.set(
        card.id,
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
        ),
      )
    }

    if (filters.openNow) {
      // دادهٔ ساعت نامعلوم زیر برچسب «الان باز» پذیرفته نمی‌شود.
      cards = cards.filter((card) => openStates.get(card.id)?.status === 'open')
      total = cards.length
      // نقشه همهٔ نتایج باز را می‌خواهد؛ نزدیک‌ترین نیز باید پیش از صفحه‌بندی
      // روی کل کاندیداها مرتب شود.
      if (!filters.nearMe && filters.view !== 'map') {
        const start = (filters.page - 1) * pageSize
        cards = cards.slice(start, start + pageSize)
      }
    }

    cards = cards.map((card) => {
      const state = openStates.get(card.id)
      return {
        ...card,
        openState: state ? { status: state.status, label: state.label } : null,
      }
    })
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  if (total > 0 && filters.page > totalPages) {
    redirect(`/search${buildQuery({ ...filters, page: totalPages })}`)
  }

  /*
    فقط صفرنتیجه‌ها ثبت می‌شوند: همان داده‌ای که برای پیدا کردن شکاف محتوا
    ارزش دارد، بدون ساختن تاریخچه‌ی کامل جست‌وجوی هر کاربر. شناسه‌ی کاربر و
    نشست عمداً فرستاده نمی‌شود و شکست analytics نباید رندر را خراب کند.
  */
  if (total === 0) {
    try {
      await trackSearch({
        userAgent: (await headers()).get('user-agent'),
        query: privacySafeQuery(filters.q),
        requestedScope: filters.scope,
        resolvedEntity: effectiveScope,
        resolvedIntent: dish
          ? `dish:${dish.slug}`
          : productIntent.kind === 'facet'
            ? `facet:${productIntent.facetId}`
            : effectiveScope === 'items'
              ? 'item-text'
              : 'place-text',
        facetIds: filters.facets,
        dishId: dish?.id ?? null,
        districtId: effectiveDistrictId,
        sort: filters.sort,
        priceMax: filters.maxPrice,
        nearMe: filters.nearMe,
        resultCount: 0,
      })
    } catch (error) {
      console.warn('[search] ثبت جست‌وجوی بدون نتیجه شکست خورد', error)
    }
  }

  /*
    عنوان از فیلترهای **مؤثر** ساخته می‌شود، نه از فیلترهای خام: کاربری که
    «کافه‌ای در احمد آباد» نوشته باید عنوانِ «کافه‌های مشهد در احمدآباد» را
    ببیند، نه «جست‌وجوی «کافه‌ای در احمد آباد»» که هیچ نمی‌گوید چه شد.
  */
  const placeHeading = describeFilters(
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

  const heading = effectiveScope === 'items'
    ? dish
      ? productPlaceQuery
        ? `${dish.nameFa} در ${productPlaceQuery}`
        : `${dish.nameFa} در منوی کافه‌های مشهد`
      : productIntent.kind === 'facet'
        ? `${facets.find((facet) => facet.id === productIntent.facetId)?.labelFa ?? parsed.text}${productPlaceQuery ? ` در ${productPlaceQuery}` : ' در منوها'}`
        : filters.q.trim()
          ? `آیتم‌های منو برای «${filters.q.trim()}»`
          : 'آیتم‌های منوی کافه‌های مشهد'
    : placeHeading

  const subheading = effectiveScope === 'items'
    ? `${total.toLocaleString('fa-IR')} آیتم واقعی از منوی کافه‌ها`
    : dish
      ? `${dish.placeCount.toLocaleString('fa-IR')} مجموعه ${dish.nameFa} دارند` +
        (dish.minPrice ? ` · ارزان‌ترین ${dish.minPrice.toLocaleString('fa-IR')} تومان` : '')
      : `${total.toLocaleString('fa-IR')} مجموعه`

  return (
    <SearchView
      filters={filters}
      cards={cards}
      itemCards={itemCards}
      effectiveScope={effectiveScope}
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
      fuzzyPlaceMatch={fuzzyPlaceMatch}
      clientPaginated={filters.nearMe}
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
