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

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Coffee, MapPin, MapPinned, Search, SlidersHorizontal, UtensilsCrossed, X } from 'lucide-react'
import type { MapLabel } from '@/components/map/CafeMap'
import { MapImportBoundary } from '@/components/map/LazyCafeMap'
import { PlaceCardView, type CardData } from '@/components/cafe/PlaceCardView'
import { MenuItemCard } from '@/components/items/MenuItemCard'
import type { MenuItemCard as MenuItemCardData } from '@/core/items/queries'
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
import { FacetIcon } from '@/components/ui/FacetIcon'
import type { SearchSuggestion } from '@/core/search/suggestions'
import { pageSlice, sortCardsByDistance, sortItemsByDistance } from '@/core/search/clientSort'
import { attributeLabel } from '@/core/taxonomy/attributes'

// نقشه فقط با انتخاب صریح کاربر لازم می‌شود. جداکردنش از chunk اصلی باعث
// می‌شود جست‌وجوی آیتم‌ها و فهرست کافه‌ها روی اینترنت موبایل سبک‌تر باز شوند.
const CafeMap = dynamic(
  () => import('@/components/map/CafeMap').then((module) => module.CafeMap),
  { ssr: false, loading: () => <p aria-live="polite">در حال آماده‌سازی نقشه…</p> },
)

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
  itemCards?: MenuItemCardData[]
  /** scope نهایی پس از تشخیص متن؛ ممکن است با `filters.scope=all` فرق کند. */
  effectiveScope?: 'places' | 'items'
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
  /**
   * منطقه‌ای که از **متنِ** کوئری حدس زده شد (نه از فیلتر صریح کاربر).
   *
   * نمایشش اجباری است: تشخیصِ خاموش یعنی کاربری که «کافه سجاد» را برای پیدا
   * کردنِ کافه‌ای به همین نام نوشته، فهرست کافه‌های *منطقه‌ی* سجاد را می‌بیند
   * و هیچ سرنخی ندارد که چرا. با این نشان، هم می‌فهمد و هم راه برگشت دارد.
   */
  detectedDistrict?: { id: string; name: string } | null
  /**
   * متنی که نادیده گرفته شد چون با آن هیچ نتیجه‌ای نبود.
   *
   * سرور فقط منطقه را نگه داشته. گفتنش لازم است، وگرنه کاربر فکر می‌کند
   * «خوب» هم اعمال شده و نتایج را اشتباه تفسیر می‌کند.
   */
  ignoredText?: string | null
  fuzzyPlaceMatch?: boolean
  /** نزدیک‌ترین بعد از مرتب‌سازی کل نتایج، در مرورگر صفحه‌بندی می‌شود. */
  clientPaginated?: boolean
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
  itemCards = [],
  effectiveScope = 'places',
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
  detectedDistrict = null,
  ignoredText = null,
  fuzzyPlaceMatch = false,
  clientPaginated = false,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [locationError, setLocationError] = useState<string | null>(null)
  const [locationCanRetry, setLocationCanRetry] = useState(true)
  const [locating, setLocating] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [searchDraft, setSearchDraft] = useState(filters.q)
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([])
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const [suggestionsLoading, setSuggestionsLoading] = useState(false)
  const [suggestionsError, setSuggestionsError] = useState(false)
  const [activeSuggestion, setActiveSuggestion] = useState(-1)
  const [searchInteracting, setSearchInteracting] = useState(false)
  const [selectedMapPlaceId, setSelectedMapPlaceId] = useState<number | null>(null)
  const searchFormRef = useRef<HTMLFormElement>(null)
  const filterButtonRef = useRef<HTMLButtonElement>(null)
  const filterDialogRef = useRef<HTMLDivElement>(null)
  const suggestionRequestRef = useRef(0)
  const leavingForResultRef = useRef(false)

  const activeCount = countActiveFilters(filters)
  const showingItems = effectiveScope === 'items'
  const sortKeys: SortKey[] = showingItems
    ? ['rating', 'price_asc', 'price_desc', 'name', 'distance']
    : (Object.keys(SORT_LABELS) as SortKey[])
  const scrollStorageKey = `kucafe:search-scroll:${buildQuery(filters)}`

  const rememberSearchScroll = useCallback(() => {
    // بعد از کلیک روی نتیجه، Next پیش از unmount صفحه را به بالای سند می‌برد.
    // رویداد scroll آن لحظه نباید مقدار واقعیِ ذخیره‌شده را با ۰ جایگزین کند.
    leavingForResultRef.current = true
    try { sessionStorage.setItem(scrollStorageKey, String(window.scrollY)) } catch { /* اختیاری */ }
  }, [scrollStorageKey])

  const apply = useCallback(
    (patch: Partial<SearchFilters>) => {
      // هر تغییر فیلتر، صفحه‌بندی را از اول شروع می‌کند: ماندن در صفحه‌ی ۴
      // بعد از عوض‌کردن فیلتر، تقریباً همیشه یک صفحه‌ی خالی است.
      const next = { ...filters, ...patch, page: patch.page ?? 1 }
      startTransition(() => router.push(`/search${buildQuery(next)}`, { scroll: false }))
    },
    [filters, router],
  )

  // لینک واقعی کنار رفتار SPA: اگر JavaScript روی اینترنت موبایل دیر برسد یا
  // hydration شکست بخورد، فیلترها همچنان با یک درخواست GET معمولی کار می‌کنند.
  const filterHref = (patch: Partial<SearchFilters>) => {
    const next = { ...filters, ...patch, page: patch.page ?? 1 }
    return `/search${buildQuery(next)}`
  }

  useEffect(() => setSearchDraft(filters.q), [filters.q])

  useEffect(() => {
    const query = searchDraft.trim()
    // query در URL می‌ماند، اما باز شدنِ صفحهٔ نتایج نباید autocomplete را
    // دوباره روی نتایج باز کند. پیشنهادها فقط هنگام تعامل با خود فیلد فعال‌اند.
    if (!searchInteracting || query.length < 2) {
      suggestionRequestRef.current += 1
      setSuggestions([])
      setSuggestionsOpen(false)
      setSuggestionsLoading(false)
      setSuggestionsError(false)
      return
    }

    const requestId = ++suggestionRequestRef.current
    setSuggestions([])
    setActiveSuggestion(-1)
    setSuggestionsLoading(true)
    setSuggestionsError(false)
    setSuggestionsOpen(true)
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/search/suggest?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        })
        if (!response.ok) throw new Error('suggestion request failed')
        const data = await response.json() as { suggestions?: SearchSuggestion[] }
        if (controller.signal.aborted || requestId !== suggestionRequestRef.current) return
        setSuggestions(data.suggestions ?? [])
        setActiveSuggestion(-1)
        setSuggestionsOpen(true)
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setSuggestions([])
          setSuggestionsError(true)
        }
      } finally {
        if (!controller.signal.aborted) setSuggestionsLoading(false)
      }
    }, 220)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [searchDraft, searchInteracting])

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!searchFormRef.current?.contains(event.target as Node)) {
        setSuggestionsOpen(false)
        setSearchInteracting(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [])

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

  useEffect(() => {
    if (!filtersOpen) return
    const returnFocus=filterButtonRef.current
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const dialog = filterDialogRef.current
    const focusable = () => Array.from(
      dialog?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], select:not([disabled]), input:not([disabled])') ?? [],
    ).filter((element) => element.offsetParent !== null)
    focusable()[0]?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setFiltersOpen(false)
        return
      }
      if (event.key !== 'Tab') return
      const nodes = focusable()
      const first = nodes[0]
      const last = nodes.at(-1)
      if (!first || !last) return
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
      returnFocus?.focus()
    }
  }, [filtersOpen])

  // Back از صفحهٔ کافه باید کاربر را به همان جای فهرست برگرداند. URL وضعیت
  // فیلتر/صفحه را نگه می‌دارد و این حافظه فقط scroll همان URL را نگه می‌دارد.
  useEffect(() => {
    leavingForResultRef.current = false
    let saved = 0
    try {
      saved = Number(sessionStorage.getItem(scrollStorageKey))
    } catch {
      // حالت خصوصی ممکن است storage را ببندد؛ رفتار عادی مرورگر باقی می‌ماند.
    }
    let restoring = Number.isFinite(saved) && saved > 0
    const previousScrollRestoration = window.history.scrollRestoration
    if (restoring) window.history.scrollRestoration = 'manual'
    const restore = () => {
      if (restoring && window.scrollY !== saved) {
        window.scrollTo({ top: saved, behavior: 'auto' })
      }
    }
    const restoreFrame = requestAnimationFrame(restore)
    // Next و مرورگر restoration خودشان را در زمان‌های متفاوت اجرا می‌کنند.
    // تا پایدارشدن RSC، رویداد scroll خودکار را ذخیره نمی‌کنیم و در دو نقطه
    // موقعیت قطعی را برمی‌گردانیم. تعامل واقعی کاربر این چرخه را قطع می‌کند.
    const restoreTimers = [120, 360, 650, 820, 1_200].map((delay) => window.setTimeout(restore, delay))
    const finishRestoreTimer = window.setTimeout(() => { restoring = false }, 1_260)
    const cancelRestore = () => { restoring = false }
    window.addEventListener('pointerdown', cancelRestore, { passive: true })
    window.addEventListener('wheel', cancelRestore, { passive: true })
    window.addEventListener('touchstart', cancelRestore, { passive: true })
    window.addEventListener('pageshow', restore)
    window.addEventListener('popstate', restore)

    let scheduled = false
    const remember = () => {
      if (leavingForResultRef.current || scheduled) return
      if (restoring) {
        // حرکت واقعیِ Scroll (لمس، کیبورد یا اسکریپت دسترس‌پذیری) باید چرخهٔ
        // restoration را متوقف کند؛ وگرنه تایمر بعدی کاربر را عقب می‌کشد.
        if (Math.abs(window.scrollY - saved) <= 2) return
        restoring = false
      }
      scheduled = true
      requestAnimationFrame(() => {
        scheduled = false
        try { sessionStorage.setItem(scrollStorageKey, String(window.scrollY)) } catch { /* اختیاری */ }
      })
    }
    window.addEventListener('scroll', remember, { passive: true })
    return () => {
      window.removeEventListener('scroll', remember)
      window.removeEventListener('pointerdown', cancelRestore)
      window.removeEventListener('wheel', cancelRestore)
      window.removeEventListener('touchstart', cancelRestore)
      window.removeEventListener('pageshow', restore)
      window.removeEventListener('popstate', restore)
      window.history.scrollRestoration = previousScrollRestoration
      cancelAnimationFrame(restoreFrame)
      restoreTimers.forEach((timer) => window.clearTimeout(timer))
      window.clearTimeout(finishRestoreTimer)
      // هنگام خروج، Next ممکن است پیش از unmount صفحه را به صفر ببرد. نوشتن
      // این مقدار در cleanup، موقعیت ذخیره‌شدهٔ لحظهٔ کلیک را خراب می‌کند.
    }
  }, [scrollStorageKey])

  function requestLocation(activateOnSuccess = false) {
    // Geolocation در Chrome/Safari فقط روی secure context مجاز است. نمایش
    // دیالوگ «اجازه داده نشد» روی previewِ HTTP گمراه‌کننده است، چون کاربر
    // اصلاً امکانی برای دادن مجوز ندارد.
    if (!window.isSecureContext) {
      setLocating(false)
      setLocationCanRetry(false)
      setLocationError('موقعیت دقیق روی آدرس HTTP در دسترس نیست؛ فعلاً محله را انتخاب کنید')
      if (filters.nearMe) apply({ nearMe: false, sort: 'rating' })
      return
    }
    if (!navigator.geolocation) {
      setLocationError('مرورگر شما موقعیت‌یابی را پشتیبانی نمی‌کند')
      setLocationCanRetry(false)
      return
    }
    setLocating(true)
    setLocationError(null)
    setLocationCanRetry(true)
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
        if (activateOnSuccess && !filters.nearMe) {
          apply({ nearMe: true, sort: 'distance' })
        }
      },
      (error) => {
        setLocating(false)
        setLocationCanRetry(true)
        setLocationError(
          error.code === error.PERMISSION_DENIED
            ? 'دسترسی موقعیت در تنظیمات مرورگر بسته است؛ نتایج همچنان بر اساس امتیازند'
            : 'موقعیت شما پیدا نشد؛ می‌توانید دوباره تلاش کنید یا محله را انتخاب کنید',
        )
        if (filters.nearMe) apply({ nearMe: false, sort: 'rating' })
      },
      // برای مرتب‌سازی کافه‌ها GPS پرمصرف لازم نیست؛ دقت شبکه/Wi‑Fi کافی است.
      { enableHighAccuracy: false, timeout: 8_000, maximumAge: 10 * 60 * 1000 },
    )
  }

  function toggleNearMe() {
    if (filters.nearMe) {
      setLocationError(null)
      apply({ nearMe: false, sort: 'rating' })
      return
    }
    if (location) {
      apply({ nearMe: true, sort: 'distance' })
      return
    }
    requestLocation(true)
  }

  /** فاصله روی کل کاندیداها محاسبه می‌شود؛ صفحه‌بندی بعد از این مرحله است. */
  const displayCards = useMemo(() => {
    if (!location) return cards
    return sortCardsByDistance(cards, location, filters.sort)
  }, [cards, location, filters.sort])

  const visibleCards = useMemo(
    () => clientPaginated ? pageSlice(displayCards, filters.page, pageSize) : displayCards,
    [clientPaginated, displayCards, filters.page, pageSize],
  )

  const displayItems = useMemo(
    () => location ? sortItemsByDistance(itemCards, location, filters.sort) : itemCards,
    [itemCards, location, filters.sort],
  )
  const visibleItems = useMemo(
    () => clientPaginated ? pageSlice(displayItems, filters.page, pageSize) : displayItems,
    [clientPaginated, displayItems, filters.page, pageSize],
  )

  const mapPlaces = useMemo(
    () =>
      displayCards
        // مختصات خارج محدوده، دادهٔ معتبر نقشهٔ مشهد نیست. این شرط با
        // `mappableOnly` سمت سرور یکسان است تا عدد و نتیجه از هم نیفتند.
        .filter((card) => card.coords !== null && card.geoStatus === 'ok')
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
  const selectedMapCard = selectedMapPlaceId === null
    ? null
    : displayCards.find((card) => card.id === selectedMapPlaceId) ?? null
  const nativeSortParams = new URLSearchParams(buildQuery(filters).replace(/^\?/, ''))
  nativeSortParams.delete('sort')
  nativeSortParams.delete('page')

  const activeFilters: { key: string; label: string; patch: Partial<SearchFilters> }[] = []
  if (filters.q.trim()) activeFilters.push({ key: 'q', label: `«${filters.q.trim()}»`, patch: { q: '', rawQuery: false } })
  if (filters.districtId) {
    activeFilters.push({
      key: 'district',
      label: districts.find((district) => district.id === filters.districtId)?.name ?? 'محله',
      patch: { districtId: null },
    })
  }
  for (const id of filters.facets) {
    activeFilters.push({
      key: `facet:${id}`,
      label: facets.find((facet) => facet.id === id)?.labelFa ?? id,
      patch: { facets: filters.facets.filter((facet) => facet !== id) },
    })
  }
  for (const id of filters.attributes) {
    activeFilters.push({
      key: `attribute:${id}`,
      label: attributeLabel(id),
      patch: { attributes: filters.attributes.filter((attribute) => attribute !== id) },
    })
  }
  for (const tier of filters.tiers) {
    activeFilters.push({
      key: `tier:${tier}`,
      label: TIER_LABELS[tier] ?? `رده ${fa(tier)}`,
      patch: { tiers: filters.tiers.filter((value) => value !== tier) },
    })
  }
  if (filters.maxPrice) activeFilters.push({ key: 'max', label: `تا ${fa(filters.maxPrice.toLocaleString('fa-IR'))} تومان`, patch: { maxPrice: null } })
  if (filters.openNow) activeFilters.push({ key: 'open', label: 'الان باز', patch: { openNow: false } })
  if (filters.nearMe) activeFilters.push({ key: 'near', label: 'نزدیک من', patch: { nearMe: false, sort: 'rating' } })
  if (filters.dish) {
    activeFilters.push({
      key: 'dish',
      label: dishNameFor(dishes, filters.dish) ?? 'خوراکی انتخاب‌شده',
      patch: { dish: null },
    })
  }

  const renderFilterGroups = () => (
    <>
      <fieldset>
        <legend>محله</legend>
        <select
          className={styles.filterSelect}
          value={filters.districtId ?? ''}
          onChange={(event) => apply({ districtId: event.target.value || null })}
          aria-label="انتخاب محله"
        >
          <option value="">همهٔ محله‌های مشهد</option>
          {districts
            .filter((district) => district.placeCount > 0)
            .map((district) => (
              <option key={district.id} value={district.id}>
                {district.name} — {fa(district.placeCount)} مجموعه
              </option>
            ))}
        </select>
      </fieldset>

      {!showingItems && <fieldset>
        <legend>رده‌ی قیمت کافه</legend>
        <div className={styles.filterOptions} role="group" aria-label="رده‌ی قیمت">
          {[1, 2, 3].map((tier) => (
            <Link
              key={tier}
              href={filterHref({
                tiers: filters.tiers.includes(tier)
                  ? filters.tiers.filter((value) => value !== tier)
                  : [...filters.tiers, tier],
              })}
              className={filters.tiers.includes(tier) ? styles.optionOn : styles.option}
              aria-pressed={filters.tiers.includes(tier)}
            >
              {TIER_LABELS[tier]}
            </Link>
          ))}
        </div>
      </fieldset>}

      <fieldset>
        <legend>{showingItems ? 'قیمت خود آیتم، حداکثر' : 'میانگین قیمت منو، حداکثر'}</legend>
        <div className={styles.filterOptions} role="group" aria-label="سقف قیمت">
          {priceCaps.map((cap) => (
            <Link
              key={cap}
              href={filterHref({ maxPrice: filters.maxPrice === cap ? null : cap })}
              className={filters.maxPrice === cap ? styles.optionOn : styles.option}
              aria-pressed={filters.maxPrice === cap}
            >
              تا {fa(cap.toLocaleString('fa-IR'))}
            </Link>
          ))}
        </div>
        <p className={styles.filterNote}>
          {showingItems
            ? 'آیتم‌هایی که قیمتشان ثبت نشده، با انتخاب سقف قیمت نمایش داده نمی‌شوند.'
            : 'با انتخاب سقف، فقط کافه‌های دارای قیمت معتبر نمایش داده می‌شوند؛ دادهٔ نامعلوم ارزان فرض نمی‌شود.'}
        </p>
      </fieldset>

      <fieldset>
        <legend>همه‌ی دسته‌ها</legend>
        <div className={styles.filterOptions} role="group" aria-label="دسته‌های منو">
          {facets.map((facet) => (
            <Link
              key={facet.id}
              href={filterHref({
                facets: filters.facets.includes(facet.id)
                  ? filters.facets.filter((value) => value !== facet.id)
                  : [...filters.facets, facet.id],
              })}
              className={filters.facets.includes(facet.id) ? styles.optionOn : styles.option}
              aria-pressed={filters.facets.includes(facet.id)}
            >
              <FacetIcon id={facet.id} size={13} /> {facet.labelFa}
              {!showingItems && <span className={styles.chipCount}>{fa(facet.placeCount)}</span>}
            </Link>
          ))}
        </div>
      </fieldset>
    </>
  )

  return (
    <main className={styles.wrap}>
      <header className={styles.head}>
        <h1 className={styles.heading}>{heading}</h1>
        <p className={styles.subheading}>
          {subheading ?? `${fa(total)} مجموعه`}
          {pending && <span className={styles.pending}> · در حال به‌روزرسانی…</span>}
        </p>

        {detectedDistrict && (
          <p className={styles.detected} role="status">
            <MapPin size={15} aria-hidden="true" />
            <span>
              منطقه‌ی <strong>{detectedDistrict.name}</strong> از متن جست‌وجو تشخیص داده
              شد — فقط نتیجه‌های همین منطقه نشان داده می‌شوند.
            </span>
            {/* راه برگشت: جست‌وجوی همان متن به‌عنوان نامِ کافه، بدون فیلتر منطقه. */}
            <button
              type="button"
              className={styles.detectedUndo}
              onClick={() => apply({ rawQuery: true, districtId: null })}
            >
              نه، دنبال کافه‌ای به این نام بودم
            </button>
          </p>
        )}

        {ignoredText && (
          <p className={styles.ignored} role="status">
            با «{ignoredText}» نتیجه‌ای نبود، پس فقط منطقه اعمال شد.
          </p>
        )}
        {fuzzyPlaceMatch && (
          <p className={styles.fuzzyNotice} role="status">
            تطابق دقیق پیدا نشد؛ نزدیک‌ترین نام‌های معتبر نمایش داده شدند.
          </p>
        )}
      </header>

      <nav className={styles.scopeSwitch} aria-label="نوع نتیجه">
        {([
          ['all', 'همه'],
          ['places', 'کافه‌ها'],
          ['items', 'آیتم‌های منو'],
        ] as const).map(([scope, label]) => (
          <button
            key={scope}
            type="button"
            className={
              filters.scope === scope
                ? styles.scopeOn
                : styles.scopeOff
            }
            onClick={() =>
              apply(
                scope === 'items'
                  ? { scope, view: 'list', nearMe: false, openNow: false, tiers: [], sort: filters.sort === 'distance' ? 'rating' : filters.sort }
                  : { scope },
              )
            }
            aria-pressed={filters.scope === scope}
          >
            {label}
            {scope === 'all' && filters.scope === 'all' && (
              <small>تشخیص خودکار</small>
            )}
          </button>
        ))}
      </nav>

      {/* ── نوار جست‌وجو و ابزار ─────────────────────────────────── */}
      <div id="search-toolbar" className={styles.toolbar}>
        <form
          ref={searchFormRef}
          className={styles.searchForm}
          onSubmit={(event) => {
            event.preventDefault()
            if (activeSuggestion >= 0 && suggestions[activeSuggestion]) {
              setSuggestionsOpen(false)
              setSearchInteracting(false)
              router.push(suggestions[activeSuggestion].href)
              return
            }
            /*
              جست‌وجوی تازه، `raw` را صفر می‌کند: آن پرچم پاسخِ کاربر به یک
              تشخیصِ *مشخص* بود و نباید روی کوئری بعدی بچسبد.
            */
            setSuggestionsOpen(false)
            setSearchInteracting(false)
            apply({ q: searchDraft, rawQuery: false })
          }}
        >
          <input
            name="q"
            type="search"
            value={searchDraft}
            autoComplete="off"
            placeholder="نام کافه یا آیتم؛ مثلاً پاستا، لاته"
            aria-label="جست‌وجوی کافه یا آیتم منو"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={suggestionsOpen}
            aria-controls={suggestionsOpen ? 'search-suggestions' : undefined}
            aria-activedescendant={activeSuggestion >= 0 ? `search-suggestion-${activeSuggestion}` : undefined}
            onChange={(event) => {
              setSearchDraft(event.target.value)
              setSearchInteracting(true)
            }}
            onFocus={() => {
              setSearchInteracting(true)
              if (searchDraft.trim().length >= 2) setSuggestionsOpen(true)
            }}
            onKeyDown={(event) => {
              if (!suggestionsOpen) return
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setActiveSuggestion((current) => Math.min(current + 1, suggestions.length - 1))
              } else if (event.key === 'ArrowUp') {
                event.preventDefault()
                setActiveSuggestion((current) => Math.max(current - 1, 0))
              } else if (event.key === 'Escape') {
                setSuggestionsOpen(false)
                setSearchInteracting(false)
              }
            }}
          />
          <button type="submit">جست‌وجو</button>
          {suggestionsOpen && (
            <div id="search-suggestions" className={styles.suggestionPanel}>
              <div className={styles.suggestionHead}>
                <span>پیشنهادهای مرتبط</span>
                <button
                  type="button"
                  className={styles.suggestionClose}
                  onClick={() => {
                    setSuggestionsOpen(false)
                    setSearchInteracting(false)
                  }}
                  aria-label="بستن پیشنهادها"
                >
                  <X size={18} aria-hidden="true" />
                </button>
              </div>
              {suggestionsLoading ? (
                <p className={styles.suggestionStatus} role="status">در حال جست‌وجو…</p>
              ) : suggestionsError ? (
                <p className={styles.suggestionStatus} role="status">
                  پیشنهادهای سریع در دسترس نیست؛ دکمهٔ جست‌وجو همچنان کار می‌کند.
                </p>
              ) : suggestions.length > 0 ? (
                <ul role="listbox">
                  {suggestions.map((suggestion, index) => (
                    <li
                      id={`search-suggestion-${index}`}
                      key={`${suggestion.type}-${suggestion.href}`}
                      role="option"
                      aria-selected={index === activeSuggestion}
                    >
                      <Link
                        className={index === activeSuggestion ? styles.suggestionActive : styles.suggestion}
                        href={suggestion.href}
                        onMouseEnter={() => setActiveSuggestion(index)}
                        onClick={() => {
                          setSuggestionsOpen(false)
                          setSearchInteracting(false)
                        }}
                      >
                        <span className={styles.suggestionIcon} aria-hidden="true">
                          {suggestion.type === 'place' || suggestion.type === 'district'
                            ? <MapPin size={18} />
                            : suggestion.type === 'item'
                              ? <UtensilsCrossed size={18} />
                              : suggestion.type === 'dish'
                                ? <Coffee size={18} />
                                : <Search size={18} />}
                        </span>
                        <span><strong>{suggestion.label}</strong><small>{suggestion.meta}</small></span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.suggestionStatus}>پیشنهاد مستقیمی نبود؛ Enter را بزنید تا همهٔ نتایج دیده شود.</p>
              )}
              <button
                type="button"
                className={styles.suggestionAll}
                onClick={() => {
                  setSuggestionsOpen(false)
                  setSearchInteracting(false)
                  setActiveSuggestion(-1)
                  apply({ q: searchDraft, rawQuery: false })
                }}
              >
                نمایش همهٔ نتایج برای «{searchDraft.trim()}»
              </button>
            </div>
          )}
        </form>

        <div className={styles.toolbarActions}>
          <button
            type="button"
            className={`${styles.toggle} ${filters.nearMe ? styles.toggleOn : ''}`}
            onClick={toggleNearMe}
            disabled={locating}
            aria-pressed={filters.nearMe}
          >
            {locating ? 'در حال یافتن…' : 'نزدیک من'}
          </button>
          {!showingItems && <button
            type="button"
            className={`${styles.toggle} ${filters.openNow ? styles.toggleOn : ''}`}
            onClick={() => apply({ openNow: !filters.openNow })}
            aria-pressed={filters.openNow}
          >
            الان باز
          </button>}

          <form action="/search" method="get" className={styles.sortWrap}>
            {[...nativeSortParams.entries()].map(([name, value], index) => (
              <input key={`${name}-${index}`} type="hidden" name={name} value={value} />
            ))}
            <span className={styles.srOnly}>مرتب‌سازی</span>
            <select
              name="sort"
              value={filters.sort}
              onChange={(event) => {
                const sort = event.target.value as SortKey
                if (sort === 'distance') {
                  if (location) apply({ nearMe: true, sort: 'distance' })
                  else requestLocation(true)
                  return
                }
                apply({ sort, nearMe: filters.nearMe ? false : filters.nearMe })
              }}
            >
              {sortKeys.map((key) => (
                <option key={key} value={key}>
                  {showingItems && key === 'rating' ? 'پیشنهادی' : SORT_LABELS[key]}
                </option>
              ))}
            </select>
            <button type="submit" className={styles.sortApply}>اعمال</button>
          </form>

          {!showingItems && <div className={styles.viewSwitch} role="group" aria-label="نمایش">
            <Link
              href={filterHref({ view: 'list', page: filters.page })}
              className={filters.view === 'list' ? styles.viewOn : styles.viewOff}
              aria-pressed={filters.view === 'list'}
            >
              فهرست
            </Link>
            <Link
              href={filterHref({ view: 'map', page: filters.page })}
              className={filters.view === 'map' ? styles.viewOn : styles.viewOff}
              aria-pressed={filters.view === 'map'}
            >
              نقشه
            </Link>
          </div>}

          <button
            type="button"
            ref={filterButtonRef}
            className={styles.filterButton}
            onClick={() => setFiltersOpen(true)}
            aria-expanded={filtersOpen}
            aria-controls="mobile-search-filters"
          >
            <SlidersHorizontal size={16} aria-hidden="true" />
            فیلترها
            {activeCount > 0 && <span className={styles.filterCount}>{fa(activeCount)}</span>}
          </button>
        </div>
      </div>

      {locationError && (
        <div className={styles.locationError} role="status">
          <span>{locationError}</span>
          <span className={styles.locationErrorActions}>
            <button type="button" onClick={() => setFiltersOpen(true)}>
              انتخاب محله
            </button>
            {locationCanRetry && (
              <button type="button" onClick={() => requestLocation(true)}>
                تلاش دوباره
              </button>
            )}
          </span>
        </div>
      )}

      {/* یک مرجع واحد برای تمام فیلترهای فعال؛ دسته‌ها دیگر هم بالا و هم در
          پنل تکرار نمی‌شوند. */}
      {activeFilters.length > 0 && (
        <div className={styles.activeFilters} aria-label="فیلترهای فعال">
          <span className={styles.activeFiltersLabel}>فیلترهای فعال</span>
          {activeFilters.map((filter) => (
          <Link
            key={filter.key}
            href={filterHref(filter.patch)}
            className={styles.activeFilter}
            aria-label={`حذف فیلتر ${filter.label}`}
          >
            {filter.label}<X size={14} aria-hidden="true" />
          </Link>
          ))}
          <Link href="/search" className={styles.activeFiltersClear}>پاک‌کردن همه</Link>
        </div>
      )}

      {/* خوراکی محبوب نقطهٔ شروع است، نه ادعای اثبات‌نشدهٔ «بهترین». */}
      {dishes.length > 0 && (
        <div className={styles.dishRow} role="group" aria-label="جست‌وجوی خوراکی محبوب">
          <span className={styles.dishLabel}>شروع از خوراکی:</span>
          {dishes.slice(0, 12).map((dish) => (
            <button
              key={dish.slug}
              type="button"
              className={`${styles.dishChip} ${filters.dish === dish.slug ? styles.dishChipOn : ''}`}
              onClick={() =>
                apply({
                  dish: filters.dish === dish.slug ? null : dish.slug,
                  scope: filters.dish === dish.slug ? filters.scope : 'items',
                  nearMe: false,
                  sort: filters.dish === dish.slug ? filters.sort : 'rating',
                })
              }
              aria-pressed={filters.dish === dish.slug}
            >
              {dish.nameFa}
            </button>
          ))}
        </div>
      )}

      {/* فیلتر موبایل؛ روی دسکتاپ ستون کناری همیشه در دسترس است. */}
      <div
        id="mobile-search-filters"
        className={`${styles.mobileFilterPanel} ${filtersOpen ? styles.mobileFilterPanelOpen : ''}`}
      >
          <button
            type="button"
            className={styles.mobileFilterBackdrop}
            aria-label="بستن فیلترها"
            onClick={() => setFiltersOpen(false)}
          />
          <div ref={filterDialogRef} className={styles.mobileFilterSheet} role="dialog" aria-modal="true" aria-label="فیلترهای جست‌وجو">
            <div className={styles.mobileFilterHead}>
              <strong>فیلترها</strong>
              <button type="button" onClick={() => setFiltersOpen(false)} aria-label="بستن فیلترها">
                <X size={22} aria-hidden="true" />
              </button>
            </div>
            <div className={styles.filterPanel}>
            {renderFilterGroups()}
            {activeCount > 0 && (
              <Link
                href="/search"
                className={styles.clearAll}
              >
                پاک‌کردن همه‌ی فیلترها
              </Link>
            )}
            </div>
            <button type="button" className={styles.mobileFilterDone} onClick={() => setFiltersOpen(false)}>
              دیدن {fa(total)} نتیجه
            </button>
          </div>
      </div>

      <div className={styles.contentLayout}>
        <aside className={styles.desktopSidebar} aria-label="فیلترهای جست‌وجو">
          {!showingItems && <button
            type="button"
            className={styles.mapTeaser}
            onClick={() => apply({ view: 'map', page: filters.page })}
          >
            <MapPinned size={25} aria-hidden="true" />
            <span>
              <strong>دیدن نتیجه‌ها روی نقشه</strong>
              <small>{fa(mapPlaces.length)} مکان دارای مختصات</small>
            </span>
          </button>}
          <div className={styles.filterPanel}>
            <div className={styles.filterPanelTitle}>
              <span>فیلتر دقیق</span>
              {activeCount > 0 && <span>{fa(activeCount)} انتخاب</span>}
            </div>
            {renderFilterGroups()}
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
        </aside>

        {/* ── نتیجه ─────────────────────────────────────────────── */}
        <section className={styles.resultColumn} aria-live="polite" aria-busy={pending}>
          {(showingItems ? visibleItems.length : filters.view === 'map' ? displayCards.length : visibleCards.length) === 0 ? (
            <div className={styles.empty}>
              <p className={styles.emptyTitle}>نتیجه‌ای پیدا نشد</p>
              <p className={styles.emptyNote}>
                {showingItems
                  ? 'عبارت یا فیلتر قیمت و محله را تغییر دهید؛ فقط آیتم‌های واقعی منو نمایش داده می‌شوند.'
                  : <>فیلترها را کمتر کنید. اگر چند دسته را با هم انتخاب کرده‌اید، کافه باید <strong>همه‌ی</strong> آن‌ها را داشته باشد.</>}
              </p>
              <button type="button" onClick={() => startTransition(() => router.push('/search'))}>
                پاک‌کردن فیلترها
              </button>
            </div>
          ) : !showingItems && filters.view === 'map' ? (
            <div className={styles.mapView}>
              <MapImportBoundary minHeight="min(70vh, 620px)">
                <CafeMap
                  places={mapPlaces}
                  labels={labels}
                  userLocation={location}
                  center={mapConfig?.center}
                  zoom={mapConfig?.zoom}
                  minZoom={mapConfig?.minZoom}
                  maxZoom={mapConfig?.maxZoom}
                  height="min(70vh, 620px)"
                  focusSlug={selectedMapCard?.slug ?? null}
                  onSelect={(place) => setSelectedMapPlaceId(place.id)}
                  stateStorageKey={`kucafe:search-map:${buildQuery(filters)}`}
                />
              </MapImportBoundary>
              <p className={styles.mapNote}>
                {fa(mapPlaces.length)} از {fa(total)} نتیجه مختصات معتبر دارند و روی نقشه
                دیده می‌شوند. فاصله‌ها مستقیم‌اند، نه مسافت مسیر.
              </p>
              {selectedMapCard && (
                <div className={styles.mapSelection} aria-live="polite">
                  <div className={styles.mapSelectionHead}>
                    <strong>انتخاب روی نقشه</strong>
                    <button type="button" onClick={() => setSelectedMapPlaceId(null)} aria-label="بستن کارت انتخاب‌شده">
                      <X size={18} aria-hidden="true" />
                    </button>
                  </div>
                  <Link href={`/cafe/${selectedMapCard.slug}`} className={styles.mapSelectionCard} onClick={rememberSearchScroll}>
                    {selectedMapCard.cover || selectedMapCard.logo ? (
                      <img
                        src={(selectedMapCard.cover ?? selectedMapCard.logo)!.url}
                        alt=""
                        width={72}
                        height={72}
                      />
                    ) : (
                      <span className={styles.mapSelectionImage}><Coffee size={24} aria-hidden="true" /></span>
                    )}
                    <span>
                      <strong>{selectedMapCard.name}</strong>
                      <small>
                        {selectedMapCard.districtName ?? 'مشهد'}
                        {selectedMapCard.distanceKm != null ? ` · فاصله مستقیم ${formatDistance(selectedMapCard.distanceKm)}` : ''}
                      </small>
                    </span>
                    <b>مشاهده</b>
                  </Link>
                </div>
              )}
            </div>
          ) : (
            <>
              <ul className={showingItems ? styles.itemResults : styles.results}>
                {showingItems
                  ? visibleItems.map((item) => <li key={item.id} onClickCapture={rememberSearchScroll}><MenuItemCard item={item} /></li>)
                  : visibleCards.map((card) => (
                    <li key={card.id} onClickCapture={rememberSearchScroll}>
                      <PlaceCardView
                        card={card}
                        dishLabel={filters.dish ? dishNameFor(dishes, filters.dish) : null}
                      />
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
        </section>
      </div>

      <p className={styles.footNote}>
        <Link href="/">صفحه‌ی اول</Link> · داده‌ی منو و قیمت از منوی رسمی مجموعه‌ها
        گرفته شده و ممکن است تغییر کرده باشد.
      </p>
    </main>
  )
}

function dishNameFor(dishes: DishOption[], slug: string): string | null {
  return dishes.find((dish) => dish.slug === slug)?.nameFa ?? null
}

function formatDistance(km: number): string {
  return km < 1 ? `${fa(Math.round(km * 1000))} متر` : `${fa(km.toFixed(1))} کیلومتر`
}

export default SearchView
