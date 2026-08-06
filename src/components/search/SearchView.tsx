'use client'

/**
 * نمای جست‌وجو و کشف — نوار فیلتر، فهرست، نقشه.
 *
 * ═══ چرا فیلترها در URL می‌نشینند ═══
 *
 * هر تغییر فیلتر یک `router.push` است، نه `setState`. یعنی دکمه‌ی back مرورگر
 * کار می‌کند، لینک «ارزان‌ترین پاستاهای وکیل‌آباد» قابل فرستادن است، و
 * صفحه‌ی نتیجه قابل ایندکس‌شدن.
 *
 * ═══ «نزدیک من» چطور کار می‌کند ═══
 *
 * موقعیت کاربر فقط در مرورگر وجود دارد و سرور آن را ندارد. پس سرور نتایج را
 * با رتبه‌بندی معمول می‌دهد و **مرتب‌سازی فاصله در کلاینت** انجام می‌شود.
 * برای ۳۳۱ کافه این کار میکروثانیه‌ای است و یک رفت‌وبرگشت شبکه کمتر دارد.
 *
 * موقعیت در `sessionStorage` می‌ماند تا هر بار از کاربر اجازه نخواهیم —
 * دیالوگ تکراری اجازه، آزاردهنده است و کاربر بار دوم رد می‌کند.
 */

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CafeMap, type MapLabel } from '@/components/map/CafeMap'
import { PlaceCardView, type CardData } from '@/components/cafe/PlaceCardView'
import {
  buildQuery,
  countActiveFilters,
  PRICE_CAPS,
  SORT_LABELS,
  TIER_LABELS,
  type SearchFilters,
  type SortKey,
} from '@/core/search/filters'
import { fa } from '@/lib/format'
import styles from './SearchView.module.css'

export interface FacetOption {
  id: string
  labelFa: string
  icon: string | null
  placeCount: number
}

export interface DishOption {
  slug: string
  nameFa: string
  placeCount: number
}

export interface DistrictOption {
  id: string
  name: string
  placeCount: number
}

interface Props {
  filters: SearchFilters
  cards: CardData[]
  total: number
  facets: FacetOption[]
  dishes: DishOption[]
  districts: DistrictOption[]
  labels: MapLabel[]
  heading: string
  /** توضیح زیر عنوان — مثلاً «۱۰۹ کافه پاستا دارند». */
  subheading?: string
  pageSize: number
  /**
   * سقف‌های نوار قیمت — از تنظیمات پنل ادمین.
   *
   * `PRICE_CAPS` در `filters.ts` پیش‌فرض است و اگر این prop نیاید همان
   * استفاده می‌شود، تا این کامپوننت در جای دیگری هم قابل استفاده بماند.
   */
  priceCaps?: readonly number[]
  /** مرکز، زوم و حدود زوم نقشه — از تنظیمات پنل ادمین. */
  mapConfig?: {
    center: { lat: number; lng: number }
    zoom: number
    minZoom: number
    maxZoom: number
  }
}

const STORAGE_KEY = 'cafegard:lastLocation'

interface StoredLocation {
  lat: number
  lng: number
  at: number
}

export function SearchView({
  filters,
  cards,
  total,
  facets,
  dishes,
  districts,
  labels,
  heading,
  subheading,
  pageSize,
  priceCaps = PRICE_CAPS,
  mapConfig,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [locationError, setLocationError] = useState<string | null>(null)
  const [locating, setLocating] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)

  const activeCount = countActiveFilters(filters)

  const apply = useCallback(
    (patch: Partial<SearchFilters>) => {
      // هر تغییر فیلتر، صفحه‌بندی را از اول شروع می‌کند: ماندن در صفحه‌ی ۴
      // بعد از عوض‌کردن فیلتر، تقریباً همیشه یک صفحه‌ی خالی است.
      const next = { ...filters, ...patch, page: patch.page ?? 1 }
      startTransition(() => router.push(`/search${buildQuery(next)}`, { scroll: false }))
    },
    [filters, router],
  )

  const toggleFacet = (id: string) => {
    const next = filters.facets.includes(id)
      ? filters.facets.filter((facet) => facet !== id)
      : [...filters.facets, id]
    apply({ facets: next })
  }

  const toggleTier = (tier: number) => {
    const next = filters.tiers.includes(tier)
      ? filters.tiers.filter((value) => value !== tier)
      : [...filters.tiers, tier]
    apply({ tiers: next })
  }

  // ── موقعیت کاربر: از حافظه‌ی نشست، وگرنه درخواست
  useEffect(() => {
    if (!filters.nearMe || location) return
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY)
      if (raw) {
        const stored = JSON.parse(raw) as StoredLocation
        // موقعیتِ کهنه بی‌فایده است؛ کاربر جابه‌جا شده.
        if (Date.now() - stored.at < 30 * 60 * 1000) {
          setLocation({ lat: stored.lat, lng: stored.lng })
          return
        }
      }
    } catch {
      // sessionStorage ممکن است در حالت خصوصی نباشد — اشکالی ندارد.
    }
    requestLocation()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.nearMe])

  function requestLocation() {
    if (!navigator.geolocation) {
      setLocationError('مرورگر شما موقعیت‌یابی را پشتیبانی نمی‌کند')
      return
    }
    setLocating(true)
    setLocationError(null)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next = { lat: position.coords.latitude, lng: position.coords.longitude }
        setLocation(next)
        setLocating(false)
        try {
          sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...next, at: Date.now() }))
        } catch {
          // نوشتن در حافظه اجباری نیست.
        }
      },
      (error) => {
        setLocating(false)
        setLocationError(
          error.code === error.PERMISSION_DENIED
            ? 'اجازه‌ی موقعیت داده نشد — نتایج بر اساس امتیاز مرتب شده‌اند'
            : 'موقعیت شما پیدا نشد',
        )
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 5 * 60 * 1000 },
    )
  }

  /** فاصله را اضافه و اگر لازم بود مرتب می‌کند. */
  const displayCards = useMemo(() => {
    if (!location) return cards
    const withDistance = cards.map((card) => ({
      ...card,
      distanceKm:
        card.coords === null
          ? null
          : haversine(location, card.coords),
    }))
    if (filters.sort !== 'distance') return withDistance
    return withDistance.sort((a, b) => {
      // کافه‌ی بی‌مختصات آخر می‌رود، نه اول: «نامعلوم» نزدیک نیست.
      if (a.distanceKm === null) return 1
      if (b.distanceKm === null) return -1
      return a.distanceKm - b.distanceKm
    })
  }, [cards, location, filters.sort])

  const mapPlaces = useMemo(
    () =>
      displayCards
        .filter((card) => card.coords !== null)
        .map((card) => ({
          id: card.id,
          slug: card.slug,
          name: card.name,
          lat: card.coords!.lat,
          lng: card.coords!.lng,
          logoUrl: card.logo?.url ?? null,
        })),
    [displayCards],
  )

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className={styles.wrap}>
      <header className={styles.head}>
        <h1 className={styles.heading}>{heading}</h1>
        <p className={styles.subheading}>
          {subheading ?? `${fa(total)} مجموعه`}
          {pending && <span className={styles.pending}> · در حال به‌روزرسانی…</span>}
        </p>
      </header>

      {/* ── نوار جست‌وجو و ابزار ─────────────────────────────────── */}
      <div className={styles.toolbar}>
        <form
          className={styles.searchForm}
          onSubmit={(event) => {
            event.preventDefault()
            const value = new FormData(event.currentTarget).get('q')
            apply({ q: typeof value === 'string' ? value : '' })
          }}
        >
          <input
            name="q"
            type="search"
            defaultValue={filters.q}
            placeholder="نام کافه را بنویس"
            aria-label="جست‌وجوی نام کافه"
          />
          <button type="submit">جست‌وجو</button>
        </form>

        <div className={styles.toolbarActions}>
          <button
            type="button"
            className={`${styles.toggle} ${filters.nearMe ? styles.toggleOn : ''}`}
            onClick={() => apply({ nearMe: !filters.nearMe, sort: filters.nearMe ? 'rating' : 'distance' })}
          >
            {locating ? 'در حال یافتن…' : 'نزدیک من'}
          </button>
          <button
            type="button"
            className={`${styles.toggle} ${filters.openNow ? styles.toggleOn : ''}`}
            onClick={() => apply({ openNow: !filters.openNow })}
          >
            الان باز
          </button>

          <label className={styles.sortWrap}>
            <span className={styles.srOnly}>مرتب‌سازی</span>
            <select
              value={filters.sort}
              onChange={(event) => apply({ sort: event.target.value as SortKey })}
            >
              {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                <option key={key} value={key}>
                  {SORT_LABELS[key]}
                </option>
              ))}
            </select>
          </label>

          <div className={styles.viewSwitch} role="group" aria-label="نمایش">
            <button
              type="button"
              className={filters.view === 'list' ? styles.viewOn : styles.viewOff}
              onClick={() => apply({ view: 'list', page: filters.page })}
            >
              فهرست
            </button>
            <button
              type="button"
              className={filters.view === 'map' ? styles.viewOn : styles.viewOff}
              onClick={() => apply({ view: 'map', page: filters.page })}
            >
              نقشه
            </button>
          </div>

          <button
            type="button"
            className={styles.filterButton}
            onClick={() => setFiltersOpen((value) => !value)}
            aria-expanded={filtersOpen}
          >
            فیلترها
            {activeCount > 0 && <span className={styles.filterCount}>{fa(activeCount)}</span>}
          </button>
        </div>
      </div>

      {locationError && filters.nearMe && (
        <p className={styles.locationError}>
          {locationError}{' '}
          <button type="button" onClick={requestLocation}>
            تلاش دوباره
          </button>
        </p>
      )}

      {/* ── فیلترهای پرمصرف — همیشه دیده می‌شوند ─────────────────── */}
      <div className={styles.quickFilters}>
        {facets.slice(0, 10).map((facet) => (
          <button
            key={facet.id}
            type="button"
            className={`${styles.chip} ${filters.facets.includes(facet.id) ? styles.chipOn : ''}`}
            onClick={() => toggleFacet(facet.id)}
          >
            <span aria-hidden="true">{facet.icon}</span>
            {facet.labelFa}
            <span className={styles.chipCount}>{fa(facet.placeCount)}</span>
          </button>
        ))}
      </div>

      {/* ── «بهترین X نزدیک من» ─────────────────────────────────── */}
      {dishes.length > 0 && (
        <div className={styles.dishRow}>
          <span className={styles.dishLabel}>بهترین:</span>
          {dishes.slice(0, 12).map((dish) => (
            <button
              key={dish.slug}
              type="button"
              className={`${styles.dishChip} ${filters.dish === dish.slug ? styles.dishChipOn : ''}`}
              onClick={() =>
                apply({
                  dish: filters.dish === dish.slug ? null : dish.slug,
                  // انتخاب یک دیش تقریباً همیشه با نیت «نزدیک من» می‌آید.
                  nearMe: filters.dish === dish.slug ? filters.nearMe : true,
                  sort: filters.dish === dish.slug ? filters.sort : 'distance',
                })
              }
            >
              {dish.nameFa}
            </button>
          ))}
        </div>
      )}

      {/* ── پنل فیلتر کامل ──────────────────────────────────────── */}
      {filtersOpen && (
        <div className={styles.filterPanel}>
          <fieldset>
            <legend>محله</legend>
            <div className={styles.filterOptions}>
              <button
                type="button"
                className={filters.districtId === null ? styles.optionOn : styles.option}
                onClick={() => apply({ districtId: null })}
              >
                همه
              </button>
              {districts
                .filter((district) => district.placeCount > 0)
                .map((district) => (
                  <button
                    key={district.id}
                    type="button"
                    className={
                      filters.districtId === district.id ? styles.optionOn : styles.option
                    }
                    onClick={() =>
                      apply({ districtId: filters.districtId === district.id ? null : district.id })
                    }
                  >
                    {district.name}
                    <span className={styles.chipCount}>{fa(district.placeCount)}</span>
                  </button>
                ))}
            </div>
          </fieldset>

          <fieldset>
            <legend>رده‌ی قیمت</legend>
            <div className={styles.filterOptions}>
              {[1, 2, 3].map((tier) => (
                <button
                  key={tier}
                  type="button"
                  className={filters.tiers.includes(tier) ? styles.optionOn : styles.option}
                  onClick={() => toggleTier(tier)}
                >
                  {TIER_LABELS[tier]}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend>میانگین قیمت منو، حداکثر</legend>
            <div className={styles.filterOptions}>
              {priceCaps.map((cap) => (
                <button
                  key={cap}
                  type="button"
                  className={filters.maxPrice === cap ? styles.optionOn : styles.option}
                  onClick={() => apply({ maxPrice: filters.maxPrice === cap ? null : cap })}
                >
                  تا {fa(cap.toLocaleString('fa-IR'))}
                </button>
              ))}
            </div>
            <p className={styles.filterNote}>
              کافه‌هایی که قیمت منوشان ثبت نشده حذف نمی‌شوند — «نمی‌دانیم» یعنی
              نمی‌دانیم، نه گران.
            </p>
          </fieldset>

          <fieldset>
            <legend>همه‌ی دسته‌ها</legend>
            <div className={styles.filterOptions}>
              {facets.map((facet) => (
                <button
                  key={facet.id}
                  type="button"
                  className={filters.facets.includes(facet.id) ? styles.optionOn : styles.option}
                  onClick={() => toggleFacet(facet.id)}
                >
                  <span aria-hidden="true">{facet.icon}</span> {facet.labelFa}
                  <span className={styles.chipCount}>{fa(facet.placeCount)}</span>
                </button>
              ))}
            </div>
          </fieldset>

          {activeCount > 0 && (
            <button
              type="button"
              className={styles.clearAll}
              onClick={() => startTransition(() => router.push('/search'))}
            >
              پاک‌کردن همه‌ی فیلترها
            </button>
          )}
        </div>
      )}

      {/* ── نتیجه ───────────────────────────────────────────────── */}
      {displayCards.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>نتیجه‌ای پیدا نشد</p>
          <p className={styles.emptyNote}>
            فیلترها را کمتر کنید. اگر چند دسته را با هم انتخاب کرده‌اید، کافه باید
            <strong> همه‌ی</strong> آن‌ها را داشته باشد.
          </p>
          <button type="button" onClick={() => startTransition(() => router.push('/search'))}>
            پاک‌کردن فیلترها
          </button>
        </div>
      ) : filters.view === 'map' ? (
        <div className={styles.mapView}>
          <CafeMap
            places={mapPlaces}
            labels={labels}
            userLocation={location}
            center={mapConfig?.center}
            zoom={mapConfig?.zoom}
            minZoom={mapConfig?.minZoom}
            maxZoom={mapConfig?.maxZoom}
            height="min(70vh, 620px)"
          />
          <p className={styles.mapNote}>
            {fa(mapPlaces.length)} از {fa(displayCards.length)} نتیجه مختصات دارند و روی
            نقشه دیده می‌شوند.
          </p>
        </div>
      ) : (
        <>
          <ul className={styles.results}>
            {displayCards.map((card) => (
              <li key={card.id}>
                <PlaceCardView card={card} dishLabel={filters.dish ? dishNameFor(dishes, filters.dish) : null} />
              </li>
            ))}
          </ul>

          {totalPages > 1 && (
            <nav className={styles.pager} aria-label="صفحه‌بندی">
              <button
                type="button"
                disabled={filters.page <= 1}
                onClick={() => apply({ page: filters.page - 1 })}
              >
                قبلی
              </button>
              <span>
                صفحه {fa(filters.page)} از {fa(totalPages)}
              </span>
              <button
                type="button"
                disabled={filters.page >= totalPages}
                onClick={() => apply({ page: filters.page + 1 })}
              >
                بعدی
              </button>
            </nav>
          )}
        </>
      )}

      <p className={styles.footNote}>
        <Link href="/">صفحه‌ی اول</Link> · داده‌ی منو و قیمت از منوی رسمی مجموعه‌ها
        گرفته شده و ممکن است تغییر کرده باشد.
      </p>
    </div>
  )
}

function dishNameFor(dishes: DishOption[], slug: string): string | null {
  return dishes.find((dish) => dish.slug === slug)?.nameFa ?? null
}

/** فاصله‌ی هاورساین — همان فرمولِ سمت سرور، تا اعداد یکی باشند. */
function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat))
  return 2 * R * Math.asin(Math.sqrt(h))
}

export default SearchView
