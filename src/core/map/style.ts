/**
 * استایل نقشه برای MapLibre — تولیدشده در کد، نه فایل ثابت.
 *
 * ═══ چرا در کد ═══
 *
 * دو نسخه (روشن و تیره) لازم داریم و رنگ‌هایشان باید با توکن‌های طراحی سایت
 * بخوانند. اگر استایل یک فایل JSON دستی بود، هر تغییر رنگِ سایت باید دستی در
 * آن هم تکرار می‌شد و بعد از دو بار، از هم می‌افتادند.
 *
 * ═══ چرا منبع GeoJSON و نه تایل برداری ═══
 *
 * قبلاً یک منبع `vector` بود که از `/api/map/tiles/{z}/{x}/{y}` تغذیه می‌شد و
 * تایل‌ها در Node ساخته می‌شدند. اندازه‌گیری‌شده:
 *
 *   • تایل z13 مرکز مشهد **۱۱۷ کیلوبایت** بود و یک کادر معمولی ۴ تا ۹ تایل
 *     می‌خواهد — تا ~۱ مگابایت برای *یک* نما، و از نو برای نمای بعدی.
 *   • ساختِ سردِ تایل روی این ماشین تا ۲۵ ثانیه دیده شده بود.
 *   • هر پن و زوم، CPU سرور می‌خورد.
 *
 * حالا هر لایه یک منبع `geojson` است که یک‌بار از `public/map/` می‌آید
 * (**۶۷۵ کیلوبایت gzip** برای کلِ لایه‌های پایه) و MapLibre خودش در worker
 * مرورگر تایلش می‌کند. بعد از بارِ اول، پن و زوم هیچ درخواست شبکه‌ای ندارد.
 *
 * فایل‌ها استاتیک‌اند پس nginx مستقیم سروشان می‌کند و Node هیچ دخالتی در
 * نقشه ندارد. `scripts/map-publish.mjs` تولیدشان می‌کند.
 *
 * ساختمان‌ها اینجا **نیستند**: لایه‌ی سنگینی است که فقط از زوم ۱۵.۵ به بالا
 * دیده می‌شود، پس `CafeMap` آن را در همان لحظه با `addSource` اضافه می‌کند.
 * `buildingLayerSpec` پایین، همان مشخصات را برای آن کار می‌دهد تا رنگ‌ها یک
 * منبع داشته باشند.
 *
 * ═══ چرا هیچ لایه‌ی `symbol` نیست ═══
 *
 * لایه‌ی متنی MapLibre به گلیف SDF نیاز دارد (`glyphs` در استایل) و تولید
 * گلیف فارسی به `fontnik` — یک وابستگی بومی — نیاز دارد که روی این ماشین
 * بدون زنجیره‌ی build نصب نمی‌شود. اگر `glyphs` به یک URL بیرونی اشاره کند،
 * نقشه دیگر آفلاین نیست، که کل هدف را نقض می‌کند.
 *
 * پس نامِ محله‌ها، نقاط شاخص و کافه‌ها با `maplibregl.Marker` به‌صورت عنصر
 * DOM روی نقشه می‌نشینند: هم فارسی درست رندر می‌شود (مرورگر خودش شکل‌دهی
 * حروف را انجام می‌دهد — چیزی که SDF فارسی هم با آن مشکل دارد)، هم قابل
 * استایل با CSS است، هم قابل کلیک.
 */

export interface MapStyleOptions {
  /** ریشه‌ی فایل‌های منتشرشده‌ی نقشه. */
  dataUrl?: string
  theme?: 'light' | 'dark'
  /**
   * زومی که ساختمان‌ها از آن به بعد دیده می‌شوند — از تنظیمات پنل ادمین.
   *
   * حالا **دو** کار می‌کند: هم آستانه‌ی رسم است، هم آستانه‌ی *دانلود*. لایه‌ی
   * ساختمان تا اولین باری که کاربر از این زوم رد شود اصلاً گرفته نمی‌شود.
   */
  buildingsFromZoom?: number
}

/** شناسه‌ی منبع/لایه‌ی ساختمان — بین استایل و بارگذاریِ تنبل مشترک است. */
export const BUILDING_SOURCE = 'building'

/** لایه‌هایی که در بارِ اول می‌آیند. باید با `KEEP` در `map-publish.mjs` بخواند. */
export const EAGER_LAYERS = [
  'water',
  'waterway',
  'green',
  'aeroway',
  'road_major',
  'road_mid',
  'road_link',
  'poi',
] as const

interface Palette {
  background: string
  water: string
  waterLine: string
  green: string
  aeroway: string
  building: string
  buildingOutline: string
  roadMajor: string
  roadMajorCasing: string
  roadMid: string
  /** قابِ خطوطِ جاده — همان رنگِ حاشیه‌ی ساختمان، ولی نقشِ جداگانه. */
  casing: string
  poi: string
}

const LIGHT: Palette = {
  background: '#f4f2ee',
  water: '#bcdcea',
  waterLine: '#9ec9dc',
  green: '#d8e9cf',
  aeroway: '#e6e3dd',
  building: '#e4e0d8',
  buildingOutline: '#d6d1c7',
  roadMajor: '#ffffff',
  roadMajorCasing: '#e0b062',
  roadMid: '#ffffff',
  casing: '#d6d1c7',
  poi: '#8a8578',
}

const DARK: Palette = {
  background: '#191b1f',
  water: '#16323f',
  waterLine: '#1d4152',
  green: '#1c2a1e',
  aeroway: '#22242a',
  building: '#23262c',
  buildingOutline: '#2c3037',
  roadMajor: '#3a3f48',
  roadMajorCasing: '#4a4033',
  roadMid: '#33373f',
  casing: '#2c3037',
  poi: '#6b7280',
}

/**
 * پهنای خط بر حسب زوم.
 *
 * `interpolate` با پایه‌ی نمایی استفاده می‌شود چون رشد خطی، خیابان‌ها را در
 * زوم بالا نخ‌مانند و در زوم پایین بیش‌ازحد کلفت نشان می‌دهد.
 */
function width(stops: [number, number][]): unknown {
  return {
    type: 'exponential',
    base: 1.4,
    stops,
  }
}

/**
 * منبع GeoJSON با تنظیماتِ تایل‌سازیِ سمتِ کلاینت.
 *
 * `tolerance` بالاتر از پیش‌فرض (۰.۳۷۵) است: ساده‌سازیِ سخت‌گیرانه‌تر یعنی
 * چندضلعی‌های کمتر برای رسم، و در این مقیاس تفاوتش روی صفحه دیده نمی‌شود ولی
 * روی نرخ فریمِ موبایل دیده می‌شود.
 *
 * `maxzoom` روی ۱۴ است نه ۱۸: از آن زوم به بالا MapLibre همان تایلِ z14 را
 * بزرگ می‌کند، که برای هندسه‌ی برداری بی‌افت است و حافظه‌ی تایل‌سازی را
 * چندبرابر کم می‌کند.
 */
function geojsonSource(url: string, options: { maxzoom?: number; tolerance?: number } = {}) {
  return {
    type: 'geojson',
    data: url,
    maxzoom: options.maxzoom ?? 14,
    tolerance: options.tolerance ?? 0.6,
    buffer: 32,
    attribution: '© OpenStreetMap',
  }
}

/**
 * مشخصاتِ لایه‌ی ساختمان — برای افزودنِ تنبل در `CafeMap`.
 *
 * جدا از `buildMapStyle` است ولی از همان پالت می‌خواند، تا رنگِ ساختمان در دو
 * جا تعریف نشود و با تغییر تم از هم نیفتند.
 */
export function buildingLayerSpec(
  theme: 'light' | 'dark',
  buildingsFromZoom: number,
): {
  source: Record<string, unknown>
  layer: Record<string, unknown>
  /** زومی که از آن به بعد باید دانلود شود. */
  fromZoom: number
  /**
   * لایه‌ای که ساختمان باید **زیرِ** آن بنشیند.
   *
   * بدون این، `addLayer` ساختمان را روی همه‌چیز می‌گذارد و خیابان‌ها زیر
   * پلیگون‌های خاکستری گم می‌شوند.
   */
  beforeId: string
} {
  const color = theme === 'dark' ? DARK : LIGHT
  return {
    fromZoom: buildingsFromZoom,
    beforeId: 'road_link',
    source: geojsonSource(`/map/${BUILDING_SOURCE}.geojson`, { maxzoom: 15 }),
    layer: {
      id: 'building',
      type: 'fill',
      source: BUILDING_SOURCE,
      minzoom: buildingsFromZoom,
      paint: {
        'fill-color': color.building,
        'fill-outline-color': color.buildingOutline,
        // محوشدن تدریجی، تا ساختمان‌ها یک‌باره ظاهر نشوند.
        'fill-opacity': {
          stops: [
            [buildingsFromZoom, 0],
            [buildingsFromZoom + 1, 1],
          ],
        },
      },
    },
  }
}

/** کلیدِ متادیتا که `CafeMap` برای بارگذاری تنبل می‌خواند. */
export const LAZY_BUILDINGS_KEY = 'kucafe:lazyBuildings'

export function buildMapStyle(options: MapStyleOptions = {}): Record<string, unknown> {
  const { dataUrl = '/map', theme = 'light', buildingsFromZoom = 15.5 } = options
  const color = theme === 'dark' ? DARK : LIGHT
  const src = (layer: string) => `${dataUrl}/${layer}.geojson`

  return {
    version: 8,
    name: `کو کافه — ${theme === 'dark' ? 'تیره' : 'روشن'}`,
    /*
      مشخصاتِ لایه‌ی تنبل داخل خودِ استایل سفر می‌کند.

      جایگزینش این بود که کلاینت یک درخواست دوم برای گرفتن «زومِ ساختمان»
      بزند، یا آن عدد در باندل کلاینت hard-code شود — اولی یک رفت‌وبرگشت
      اضافه و دومی یعنی تغییرِ تنظیم در پنل تا ری‌بیلد بعدی دیده نمی‌شود.
      `metadata` در اسپکِ MapLibre برای همین است و خودش نادیده‌اش می‌گیرد.
    */
    metadata: {
      [LAZY_BUILDINGS_KEY]: buildingLayerSpec(theme, buildingsFromZoom),
    },
    // هیچ glyph و sprite بیرونی — نقشه کاملاً آفلاین است.
    sources: {
      water: geojsonSource(src('water'), { maxzoom: 12 }),
      waterway: geojsonSource(src('waterway')),
      green: geojsonSource(src('green'), { maxzoom: 13 }),
      aeroway: geojsonSource(src('aeroway'), { maxzoom: 12 }),
      road_major: geojsonSource(src('road_major')),
      road_mid: geojsonSource(src('road_mid')),
      road_link: geojsonSource(src('road_link')),
      poi: geojsonSource(src('poi'), { maxzoom: 15, tolerance: 0 }),
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': color.background } },
      {
        id: 'green',
        type: 'fill',
        source: 'green',
        minzoom: 11,
        paint: { 'fill-color': color.green, 'fill-opacity': 0.85 },
      },
      {
        id: 'aeroway',
        type: 'fill',
        source: 'aeroway',
        minzoom: 11,
        paint: { 'fill-color': color.aeroway },
      },
      {
        id: 'water',
        type: 'fill',
        source: 'water',
        paint: { 'fill-color': color.water },
      },
      {
        id: 'waterway',
        type: 'line',
        source: 'waterway',
        minzoom: 12,
        paint: { 'line-color': color.waterLine, 'line-width': width([[12, 0.6], [17, 3]]) },
      },

      /*
        جاده: هر رده اول با «قاب» (casing) بعد با بدنه، تا تقاطع‌ها درست دیده
        شوند. اگر همه در یک لایه باشند، خطوط از روی هم رد می‌شوند و شبکه‌ی
        جاده‌ها به‌هم‌ریخته به‌نظر می‌رسد.

        رده‌های `road_minor`، `road_path` و `road_service` حذف شدند — ۱۰
        مگابایت از منبع بودند و در نقشه‌ای که کارش جهت‌یابی است نه ناوبری،
        بلوارها و خیابان‌های اصلی کافی‌اند.
      */
      {
        id: 'road_link',
        type: 'line',
        source: 'road_link',
        minzoom: 12,
        paint: { 'line-color': color.roadMid, 'line-width': width([[12, 1], [19, 8]]) },
      },
      {
        id: 'road_mid_casing',
        type: 'line',
        source: 'road_mid',
        minzoom: 11,
        paint: { 'line-color': color.casing, 'line-width': width([[11, 2], [19, 20]]) },
      },
      {
        id: 'road_mid',
        type: 'line',
        source: 'road_mid',
        minzoom: 11,
        paint: { 'line-color': color.roadMid, 'line-width': width([[11, 1], [19, 16]]) },
      },
      {
        id: 'road_major_casing',
        type: 'line',
        source: 'road_major',
        paint: { 'line-color': color.roadMajorCasing, 'line-width': width([[9, 2], [19, 26]]) },
      },
      {
        id: 'road_major',
        type: 'line',
        source: 'road_major',
        paint: { 'line-color': color.roadMajor, 'line-width': width([[9, 1], [19, 21]]) },
      },
      {
        id: 'poi',
        type: 'circle',
        source: 'poi',
        minzoom: 15,
        paint: {
          'circle-radius': width([[15, 1.5], [18, 3.5]]),
          'circle-color': color.poi,
          'circle-opacity': 0.7,
        },
      },
    ],
  }
}
