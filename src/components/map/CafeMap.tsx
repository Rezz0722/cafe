'use client'

/**
 * نقشه‌ی کافه‌ها — MapLibre روی تایل‌های لوکال.
 *
 * ═══ چرا نشانگر DOM و نه لایه‌ی symbol ═══
 *
 * لایه‌ی متنی MapLibre گلیف SDF می‌خواهد که تولیدش وابستگی بومی دارد
 * (`src/core/map/style.ts` را ببینید). ولی این محدودیت اینجا به سود ما هم
 * تمام شد: عنصر DOM هم فارسی را با شکل‌دهی درست حروف رندر می‌کند (چیزی که
 * SDF فارسی با آن مشکل دارد)، هم با CSS سایت یکدست می‌شود، هم قابل کلیک و
 * دسترس‌پذیر است.
 *
 * ═══ خوشه‌بندی دستی ═══
 *
 * خوشه‌بندی خودِ MapLibre شمارش را با لایه‌ی متنی نشان می‌دهد که برای ما
 * ممکن نیست. پس خوشه‌بندی شبکه‌ای ساده در کلاینت انجام می‌شود: در زوم پایین
 * کافه‌های نزدیک به هم یک نشانگر با عدد می‌شوند. برای ۲۳۹ کافه، هزینه‌اش
 * در حد میکروثانیه است.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  LngLatBounds,
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  ScaleControl,
  setWorkerUrl,
  type ErrorEvent,
  type LngLatBoundsLike,
} from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import styles from './CafeMap.module.css'
import { Crosshair } from 'lucide-react'

/**
 * آدرس worker مپ‌لایبر.
 *
 * مپ‌لایبر ۶ آدرس worker خودش را از `import.meta.url` می‌سازد و آن را فقط
 * وقتی قبول می‌کند که با `http(s):` شروع شود. بعد از باندل‌شدن با Next این
 * شرط برقرار نیست، پس مپ‌لایبر رشته‌ی خالی می‌گیرد و
 * `new Worker('', { type: 'module' })` می‌سازد — که نسبت به آدرس صفحه
 * resolve می‌شود و مرورگر خودِ HTML صفحه را به‌عنوان اسکریپت ماژول رد
 * می‌کند. بی worker، هیچ تایلی رمزگشایی نمی‌شود: نقشه ساخته می‌شود ولی
 * `load` هرگز نمی‌آید و «در حال آماده‌سازی نقشه…» تا ابد می‌ماند.
 *
 * پس آدرس را صریح می‌دهیم. فایل با `npm run map:worker` از `node_modules`
 * به `public/maplibre/` کپی می‌شود (`scripts/sync-map-worker.mjs`) — هم‌دامنه
 * و آفلاین، مثل بقیه‌ی نقشه.
 */
setWorkerUrl('/maplibre/maplibre-gl-worker.mjs')

/**
 * سقف انتظار برای استایل، و برای رویداد `load` نقشه.
 *
 * چرا نگهبان لازم است: تنها چیزی که پیام «در حال آماده‌سازی نقشه…» را پاک
 * می‌کند رویداد `load` است. هر خرابی‌ای که آن رویداد را نگه دارد — worker،
 * استایل، WebGL، سروری که پاسخ نمی‌دهد — به یک پیامِ بی‌پایان و بی‌توضیح
 * تبدیل می‌شد؛ همان اشکالی که این فایل را به اینجا رساند. با نگهبان،
 * سکوت به یک پیام قابل‌پیگیری تبدیل می‌شود.
 *
 * سقفِ `load` عمداً بلند است: این رویداد تا **اولین رندر کامل** شلیک نمی‌شود،
 * یعنی منتظر گرفتن و تایل‌کردنِ لایه‌های GeoJSON می‌ماند (~۶۷۵ کیلوبایت gzip).
 * روی اتصال کند یا موبایلِ ضعیف این چند ثانیه طول می‌کشد. عددِ تنگ، نقشه‌ی
 * سالمِ کند را خطا نشان می‌داد؛ این عدد فقط خرابیِ واقعی را می‌گیرد.
 *
 * قبلاً دلیلِ این سقفِ بلند بدتر بود: تایل‌ها در سرور ساخته می‌شدند و بارِ
 * سردشان تا ~۲۵ ثانیه دیده شده بود. آن خط لوله برداشته شد.
 */
const STYLE_TIMEOUT_MS = 15_000
const LOAD_TIMEOUT_MS = 60_000

export interface MapPlace {
  id: number
  slug: string
  name: string
  lat: number
  lng: number
  priceTier?: number
  rating?: number
  logoUrl?: string | null
  /** برچسب کوتاه زیر نام — مثلاً «۱۲ آیتم پاستا از ۳۲۰ هزار». */
  note?: string | null
}

export interface MapLabel {
  name: string
  lat: number
  lng: number
  kind: string
}

export interface CafeMapProps {
  places: MapPlace[]
  /** نام محله‌ها و نقاط شاخص — برای جهت‌یابی، چون تایل‌ها برچسب ندارند. */
  labels?: MapLabel[]
  /** موقعیت کاربر، اگر اجازه داده باشد. */
  userLocation?: { lat: number; lng: number } | null
  /** کافه‌ی برجسته — در صفحه‌ی یک کافه. */
  focusSlug?: string | null
  center?: { lat: number; lng: number }
  zoom?: number
  /** کمینه و بیشینه‌ی زوم — از تنظیمات پنل ادمین. */
  minZoom?: number
  maxZoom?: number
  height?: string
  theme?: 'light' | 'dark'
  /** با کلیک روی نشانگر چه شود. بدون این، لینک به صفحه‌ی کافه باز می‌شود. */
  onSelect?: (place: MapPlace) => void
  className?: string
  /** نمایش دکمه‌ی «موقعیت من». */
  showLocate?: boolean
  /**
   * خوشه‌بندی نشانگرهای نزدیک.
   *
   * برای نقشه‌ی کافه‌ها لازم است (۳۳۱ پین روی هم می‌افتند)، ولی برای نقشه‌ی
   * **محله‌ها** غلط است: ۲۹ محله باید همیشه ۲۹ نشانگر باشند، وگرنه کاربر روی
   * یک عددِ بی‌نام کلیک می‌کند و نمی‌داند کدام محله را باز می‌کند.
   */
  cluster?: boolean
  /** نام نشانگر همیشه دیده شود، مستقل از زوم. */
  alwaysLabel?: boolean
  /**
   * پیشوند لینکِ نشانگر. پیش‌فرض صفحه‌ی کافه است؛ نقشه‌ی محله‌ها
   * `/mashhad/` می‌دهد.
   */
  linkBase?: string
}

const MASHHAD_CENTER = { lat: 36.2972, lng: 59.6067 }
const MASHHAD_BOUNDS: LngLatBoundsLike = [
  [59.05, 36.0],
  [60.0, 36.67],
]

/**
 * نشانِ پیش‌فرضِ نشانگر — برای مکانی که لوگو ندارد.
 *
 * SVG دستی و نه `lucide-react`: این نشانگرها با `innerHTML` ساخته می‌شوند نه
 * با React (MapLibre یک عنصر DOM می‌خواهد، نه یک المنت React)، پس کامپوننت
 * آیکون اینجا قابل استفاده نیست. مسیرها معادلِ `Coffee` در lucide است تا
 * ظاهرش با بقیه‌ی آیکون‌های سایت یکی بماند.
 */
const PIN_GLYPH = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2v2M14 2v2M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1"/></svg>`

/** کلیدِ متادیتای استایل که مشخصاتِ لایه‌ی تنبلِ ساختمان را حمل می‌کند. */
const LAZY_BUILDINGS_KEY = 'kucafe:lazyBuildings'

interface LazyBuildingSpec {
  fromZoom: number
  beforeId: string
  source: Record<string, unknown>
  layer: { id: string } & Record<string, unknown>
}

/**
 * لایه‌ی ساختمان را در اولین باری که کاربر به زومِ لازم رسید اضافه می‌کند.
 *
 * ═══ چرا تنبل ═══
 *
 * `building.geojson` بعد از گِردکردنِ مختصات هم ۶۴۰ کیلوبایت gzip است — تقریباً
 * هم‌اندازه‌ی *همه‌ی* لایه‌های دیگر با هم. ساختمان‌ها فقط از زوم ۱۵.۵ به بالا
 * دیده می‌شوند و بیشتر بازدیدکننده‌ها هرگز آن‌قدر زوم نمی‌کنند (نقشه‌ی صفحه‌ی
 * کافه روی ۱۶ باز می‌شود ولی نقشه‌ی جست‌وجو و محله روی ۱۱ تا ۱۴).
 *
 * پس بارِ اول ۶۷۵ کیلوبایت است، و آن ۶۴۰ کیلوبایت فقط برای کسی خرج می‌شود که
 * واقعاً زوم می‌کند. حذفِ کاملِ لایه گزینه نبود: تنظیمِ «زوم نمایش ساختمان» در
 * پنل ادمین وجود دارد و بی‌اثرکردنش یک کنترلِ دروغین می‌ساخت.
 *
 * ═══ چرا `once` کافی نیست ═══
 *
 * کاربر ممکن است چند بار از آستانه رد شود. پرچمِ `added` جلوی `addSource`
 * دوباره را می‌گیرد — که وگرنه MapLibre با خطای «source already exists»
 * می‌ترکد.
 */
function attachLazyBuildings(map: MapLibreMap, style: unknown): void {
  const spec = (style as { metadata?: Record<string, LazyBuildingSpec> } | null)?.metadata?.[
    LAZY_BUILDINGS_KEY
  ]
  if (!spec?.source || !spec.layer) return

  let added = false
  const maybeAdd = () => {
    if (added || map.getZoom() < spec.fromZoom) return
    added = true
    map.off('zoomend', maybeAdd)
    try {
      if (map.getSource(spec.layer.id)) return
      map.addSource(spec.layer.id, spec.source as never)
      // زیرِ جاده‌ها می‌نشیند، وگرنه خیابان‌ها زیر پلیگون‌ها گم می‌شوند.
      const before = map.getLayer(spec.beforeId) ? spec.beforeId : undefined
      map.addLayer(spec.layer as never, before)
    } catch (error) {
      // نقشه بدون ساختمان کاملاً قابل استفاده است؛ این خرابی نباید
      // چیزی را بشکند.
      console.warn('لایه‌ی ساختمان اضافه نشد:', error)
    }
  }

  map.on('zoomend', maybeAdd)
  // اگر نقشه از همان اول روی زومِ بالا باز شده (صفحه‌ی یک کافه)، منتظر
  // رویداد نمی‌مانیم.
  maybeAdd()
}

/** فاصله‌ی شبکه‌ی خوشه‌بندی بر حسب پیکسل صفحه. */
const CLUSTER_GRID_PX = 64
/** از این زوم به بالا، خوشه‌بندی خاموش می‌شود و همه‌ی کافه‌ها نام دارند. */
const LABEL_ZOOM = 14.5

interface Cluster {
  key: string
  lat: number
  lng: number
  places: MapPlace[]
}

/**
 * خوشه‌بندی شبکه‌ای در فضای پیکسل.
 *
 * در فضای پیکسل انجام می‌شود نه در فضای مختصات: یک شبکه‌ی درجه‌ای در زوم‌های
 * مختلف اندازه‌های خیلی متفاوتی روی صفحه دارد و نتیجه‌اش یا خوشه‌های چسبیده
 * است یا خوشه‌های بی‌دلیل.
 */
function clusterPlaces(map: MapLibreMap, places: MapPlace[]): Cluster[] {
  const grid = new Map<string, Cluster>()
  for (const place of places) {
    const point = map.project([place.lng, place.lat])
    const cellX = Math.floor(point.x / CLUSTER_GRID_PX)
    const cellY = Math.floor(point.y / CLUSTER_GRID_PX)
    const key = `${cellX}:${cellY}`
    const cluster = grid.get(key)
    if (cluster) {
      cluster.places.push(place)
      // مرکز خوشه = میانگین اعضا، تا نشانگر روی توده بنشیند نه روی اولین عضو.
      cluster.lat = cluster.places.reduce((s, p) => s + p.lat, 0) / cluster.places.length
      cluster.lng = cluster.places.reduce((s, p) => s + p.lng, 0) / cluster.places.length
    } else {
      grid.set(key, { key, lat: place.lat, lng: place.lng, places: [place] })
    }
  }
  return [...grid.values()]
}

export function CafeMap({
  places,
  labels = [],
  userLocation,
  focusSlug,
  center,
  zoom,
  minZoom = 9,
  maxZoom = 18.5,
  height = '420px',
  theme = 'light',
  onSelect,
  className,
  showLocate = true,
  cluster = true,
  alwaysLabel = false,
  linkBase = '/cafe/',
}: CafeMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const markersRef = useRef<Marker[]>([])
  const labelMarkersRef = useRef<Marker[]>([])
  const userMarkerRef = useRef<Marker | null>(null)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)

  const mappable = useMemo(
    () => places.filter((place) => Number.isFinite(place.lat) && Number.isFinite(place.lng)),
    [places],
  )

  const initialCenter = center ?? (mappable.length === 1 ? mappable[0]! : MASHHAD_CENTER)
  const initialZoom = zoom ?? (mappable.length === 1 ? 16 : 12)

  // ── ساخت نقشه، یک‌بار
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    let cancelled = false
    // در پاک‌سازی لغو می‌شوند، وگرنه بعد از unmount شلیک می‌کنند.
    let styleTimer: ReturnType<typeof setTimeout> | undefined
    let loadTimer: ReturnType<typeof setTimeout> | undefined

    const create = async () => {
      const abort = new AbortController()
      styleTimer = setTimeout(() => abort.abort(), STYLE_TIMEOUT_MS)
      try {
        // استایل از سرور می‌آید تا رنگ‌ها یک منبع داشته باشند و تغییر تم
        // نیازی به ری‌بیلد کلاینت نداشته باشد.
        const response = await fetch(`/api/map/style?theme=${theme}`, { signal: abort.signal })
        if (!response.ok) throw new Error(`استایل نقشه در دسترس نیست (${response.status})`)
        const style = await response.json()
        clearTimeout(styleTimer)
        if (cancelled || !containerRef.current) return

        const map = new MapLibreMap({
          container: containerRef.current,
          style,
          center: [initialCenter.lng, initialCenter.lat],
          zoom: initialZoom,
          minZoom,
          maxZoom,
          maxBounds: MASHHAD_BOUNDS,
          attributionControl: { compact: true },
          // چرخش نقشه در یک راهنمای کافه کاربردی ندارد و فقط باعث
          // گم‌شدن کاربر می‌شود.
          dragRotate: false,
          pitchWithRotate: false,
          touchZoomRotate: true,
          locale: {
            'AttributionControl.ToggleAttribution': 'نمایش منبع داده',
            'NavigationControl.ZoomIn': 'بزرگ‌نمایی',
            'NavigationControl.ZoomOut': 'کوچک‌نمایی',
          },
        })
        map.touchZoomRotate.disableRotation()
        map.addControl(new NavigationControl({ showCompass: false }), 'top-left')
        map.addControl(new ScaleControl({ maxWidth: 90, unit: 'metric' }), 'bottom-left')

        // آخرین خطای نقشه، تا اگر `load` نیامد بتوانیم علت را نشان دهیم
        // نه یک پیام کلی.
        let lastError: string | null = null

        map.on('load', () => {
          clearTimeout(loadTimer)
          if (!cancelled) setReady(true)
          attachLazyBuildings(map, style)
        })
        map.on('error', (event: ErrorEvent) => {
          const message = event.error?.message ?? ''
          // خطای «۲۰۴/خالی» از دوره‌ی سرو تایل می‌آمد و حالا رخ نمی‌دهد، ولی
          // نگه‌داشتنِ این گارد بی‌هزینه است و نقشه‌ی سالم را نویزی نمی‌کند.
          if (message.includes('204') || message.includes('empty')) return
          lastError = message
          console.warn('خطای نقشه:', message)
        })

        loadTimer = setTimeout(() => {
          if (cancelled || map.loaded()) return
          // نقشه‌ی نیمه‌ساخته را برمی‌داریم: بومِ چسبیده به گره‌ای که دیگر
          // در صفحه نیست، هم WebGL نگه می‌دارد هم worker.
          map.remove()
          if (mapRef.current === map) mapRef.current = null
          setFailed(lastError ?? 'نقشه در زمان معقول آماده نشد')
        }, LOAD_TIMEOUT_MS)

        mapRef.current = map
      } catch (error) {
        clearTimeout(styleTimer)
        if (cancelled) return
        setFailed(
          abort.signal.aborted
            ? 'گرفتن استایل نقشه از سرور بیش از حد طول کشید'
            : error instanceof Error
              ? error.message
              : 'نقشه بار نشد',
        )
      }
    }
    void create()

    return () => {
      cancelled = true
      clearTimeout(styleTimer)
      clearTimeout(loadTimer)
      for (const marker of markersRef.current) marker.remove()
      for (const marker of labelMarkersRef.current) marker.remove()
      markersRef.current = []
      labelMarkersRef.current = []
      mapRef.current?.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme])

  // ── نشانگر کافه‌ها، با خوشه‌بندی وابسته به زوم
  const renderMarkers = useCallback(() => {
    const map = mapRef.current
    if (!map) return

    for (const marker of markersRef.current) marker.remove()
    markersRef.current = []

    const currentZoom = map.getZoom()
    const showNames = alwaysLabel || currentZoom >= LABEL_ZOOM
    const clusters =
      !cluster || showNames
        ? mappable.map((place) => ({
            key: place.slug,
            lat: place.lat,
            lng: place.lng,
            places: [place],
          }))
        : clusterPlaces(map, mappable)

    for (const cluster of clusters) {
      const element = document.createElement(cluster.places.length > 1 ? 'button' : 'a')
      const single = cluster.places.length === 1 ? cluster.places[0]! : null

      if (single) {
        const anchor = element as HTMLAnchorElement
        anchor.href = `${linkBase}${single.slug}`
        anchor.className = `${styles.pin} ${single.slug === focusSlug ? styles.pinFocus : ''}`
        anchor.setAttribute('aria-label', single.note ? `${single.name} — ${single.note}` : single.name)
        anchor.innerHTML = `
          <span class="${styles.pinDot}" aria-hidden="true">${
            single.logoUrl
              ? `<img src="${single.logoUrl}" alt="" width="26" height="26" loading="lazy" />`
              : PIN_GLYPH
          }</span>
          ${
            showNames
              ? `<span class="${styles.pinLabel}">${escapeHtml(single.name)}${
                  single.note
                    ? `<span class="${styles.pinNote}">${escapeHtml(single.note)}</span>`
                    : ''
                }</span>`
              : ''
          }
        `
        if (onSelect) {
          anchor.addEventListener('click', (event) => {
            event.preventDefault()
            onSelect(single)
          })
        }
      } else {
        const button = element as HTMLButtonElement
        button.type = 'button'
        button.className = styles.cluster
        button.textContent = cluster.places.length.toLocaleString('fa-IR')
        button.setAttribute('aria-label', `${cluster.places.length} کافه — برای دیدن بزرگ کنید`)
        button.addEventListener('click', () => {
          map.easeTo({ center: [cluster.lng, cluster.lat], zoom: Math.min(currentZoom + 2, 17) })
        })
      }

      const marker = new Marker({ element, anchor: 'bottom' })
        .setLngLat([cluster.lng, cluster.lat])
        .addTo(map)
      markersRef.current.push(marker)
    }
  }, [mappable, focusSlug, onSelect, cluster, alwaysLabel, linkBase])

  useEffect(() => {
    if (!ready) return
    renderMarkers()
    const map = mapRef.current
    if (!map) return
    map.on('zoomend', renderMarkers)
    map.on('moveend', renderMarkers)
    return () => {
      map.off('zoomend', renderMarkers)
      map.off('moveend', renderMarkers)
    }
  }, [ready, renderMarkers])

  // ── برچسب محله و نقاط شاخص
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return

    for (const marker of labelMarkersRef.current) marker.remove()
    labelMarkersRef.current = []

    for (const label of labels) {
      const element = document.createElement('span')
      element.className = `${styles.areaLabel} ${styles[`area_${label.kind}`] ?? ''}`
      element.textContent = label.name
      const marker = new Marker({ element, anchor: 'center' })
        .setLngLat([label.lng, label.lat])
        .addTo(map)
      labelMarkersRef.current.push(marker)
    }
  }, [labels, ready])

  // ── موقعیت کاربر
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    userMarkerRef.current?.remove()
    userMarkerRef.current = null
    if (!userLocation) return

    const element = document.createElement('span')
    element.className = styles.userDot
    element.setAttribute('aria-label', 'موقعیت شما')
    userMarkerRef.current = new Marker({ element, anchor: 'center' })
      .setLngLat([userLocation.lng, userLocation.lat])
      .addTo(map)
  }, [userLocation, ready])

  // ── جا دادن همه‌ی کافه‌ها در کادر
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || center || mappable.length < 2) return
    const bounds = new LngLatBounds()
    for (const place of mappable) bounds.extend([place.lng, place.lat])
    map.fitBounds(bounds, { padding: 48, maxZoom: 15, duration: 0 })
  }, [ready, mappable, center])

  const locate = () => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (position) => {
        mapRef.current?.easeTo({
          center: [position.coords.longitude, position.coords.latitude],
          zoom: 15,
        })
      },
      () => {
        // رد کردن اجازه‌ی موقعیت خطا نیست؛ نقشه بدون آن کار می‌کند.
      },
      { enableHighAccuracy: true, timeout: 8000 },
    )
  }

  if (failed) {
    return (
      <div className={`${styles.wrap} ${className ?? ''}`} style={{ height }}>
        <div className={styles.fallback}>
          <p className={styles.fallbackTitle}>نقشه بار نشد</p>
          <p className={styles.fallbackNote}>{failed}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`${styles.wrap} ${className ?? ''}`} style={{ height }}>
      <div ref={containerRef} className={styles.canvas} />
      {!ready && <div className={styles.loading}>در حال آماده‌سازی نقشه…</div>}
      {showLocate && ready && (
        <button type="button" className={styles.locate} onClick={locate}>
          <Crosshair size={15} aria-hidden="true" /> موقعیت من
        </button>
      )}
      {ready && mappable.length === 0 && (
        <div className={styles.empty}>هیچ کافه‌ای با مختصات معتبر در این نتیجه نیست</div>
      )}
    </div>
  )
}

/** نام کافه در `innerHTML` می‌رود، پس باید امن شود. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export default CafeMap
