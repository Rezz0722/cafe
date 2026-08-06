/**
 * استایل نقشه برای MapLibre — تولیدشده در کد، نه فایل ثابت.
 *
 * ═══ چرا در کد ═══
 *
 * دو نسخه (روشن و تیره) لازم داریم و رنگ‌هایشان باید با توکن‌های طراحی سایت
 * بخوانند. اگر استایل یک فایل JSON دستی بود، هر تغییر رنگِ سایت باید دستی در
 * آن هم تکرار می‌شد و بعد از دو بار، از هم می‌افتادند.
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
  /** ریشه‌ی آدرس تایل — معمولاً همان دامنه. */
  tileUrl?: string
  theme?: 'light' | 'dark'
  /**
   * زومی که ساختمان‌ها از آن به بعد دیده می‌شوند — از تنظیمات پنل ادمین.
   *
   * پایین‌تر بردنش نقشه را در زوم شهری شلوغ و کند می‌کند؛ بالاتر بردنش
   * ساختمان‌ها را عملاً حذف می‌کند. پس تنظیم است، نه ثابت.
   */
  buildingsFromZoom?: number
}

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
  roadMinor: string
  roadService: string
  roadPath: string
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
  roadMinor: '#ffffff',
  roadService: '#f7f6f3',
  roadPath: '#cfcabf',
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
  roadMinor: '#2b2f36',
  roadService: '#252930',
  roadPath: '#33373f',
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

export function buildMapStyle(options: MapStyleOptions = {}): Record<string, unknown> {
  const {
    tileUrl = '/api/map/tiles/{z}/{x}/{y}',
    theme = 'light',
    buildingsFromZoom = 15.5,
  } = options
  const color = theme === 'dark' ? DARK : LIGHT

  return {
    version: 8,
    name: `کافه‌گرد — ${theme === 'dark' ? 'تیره' : 'روشن'}`,
    // هیچ glyph و sprite بیرونی — نقشه کاملاً آفلاین است.
    sources: {
      mashhad: {
        type: 'vector',
        tiles: [tileUrl],
        minzoom: 9,
        maxzoom: 16,
        attribution: '© OpenStreetMap',
        bounds: [59.1, 36.05, 59.95, 36.62],
      },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': color.background } },
      {
        id: 'green',
        type: 'fill',
        source: 'mashhad',
        'source-layer': 'green',
        minzoom: 11,
        paint: { 'fill-color': color.green, 'fill-opacity': 0.85 },
      },
      {
        id: 'aeroway',
        type: 'fill',
        source: 'mashhad',
        'source-layer': 'aeroway',
        minzoom: 11,
        paint: { 'fill-color': color.aeroway },
      },
      {
        id: 'water',
        type: 'fill',
        source: 'mashhad',
        'source-layer': 'water',
        paint: { 'fill-color': color.water },
      },
      {
        id: 'waterway',
        type: 'line',
        source: 'mashhad',
        'source-layer': 'waterway',
        minzoom: 12,
        paint: { 'line-color': color.waterLine, 'line-width': width([[12, 0.6], [17, 3]]) },
      },
      {
        id: 'building',
        type: 'fill',
        source: 'mashhad',
        'source-layer': 'building',
        minzoom: buildingsFromZoom,
        paint: {
          'fill-color': color.building,
          'fill-outline-color': color.buildingOutline,
          // محوشدن تدریجی، تا ساختمان‌ها یک‌باره ظاهر نشوند.
          'fill-opacity': { stops: [[buildingsFromZoom, 0], [buildingsFromZoom + 1, 1]] },
        },
      },

      // ── جاده: هر رده اول با «قاب» (casing) بعد با بدنه، تا تقاطع‌ها
      // درست دیده شوند. اگر همه در یک لایه باشند، خطوط از روی هم رد
      // می‌شوند و شبکه‌ی جاده‌ها به‌هم‌ریخته به‌نظر می‌رسد.
      {
        id: 'road_path',
        type: 'line',
        source: 'mashhad',
        'source-layer': 'road_path',
        minzoom: 15,
        paint: {
          'line-color': color.roadPath,
          'line-width': width([[15, 0.5], [19, 2]]),
          'line-dasharray': [2, 2],
        },
      },
      {
        id: 'road_service',
        type: 'line',
        source: 'mashhad',
        'source-layer': 'road_service',
        minzoom: 15,
        paint: { 'line-color': color.roadService, 'line-width': width([[15, 1], [19, 6]]) },
      },
      {
        id: 'road_minor_casing',
        type: 'line',
        source: 'mashhad',
        'source-layer': 'road_minor',
        minzoom: 13,
        paint: {
          'line-color': color.buildingOutline,
          'line-width': width([[13, 1.4], [19, 14]]),
        },
      },
      {
        id: 'road_minor',
        type: 'line',
        source: 'mashhad',
        'source-layer': 'road_minor',
        minzoom: 13,
        paint: { 'line-color': color.roadMinor, 'line-width': width([[13, 0.6], [19, 11]]) },
      },
      {
        id: 'road_link',
        type: 'line',
        source: 'mashhad',
        'source-layer': 'road_link',
        minzoom: 12,
        paint: { 'line-color': color.roadMid, 'line-width': width([[12, 1], [19, 8]]) },
      },
      {
        id: 'road_mid_casing',
        type: 'line',
        source: 'mashhad',
        'source-layer': 'road_mid',
        minzoom: 11,
        paint: { 'line-color': color.buildingOutline, 'line-width': width([[11, 2], [19, 20]]) },
      },
      {
        id: 'road_mid',
        type: 'line',
        source: 'mashhad',
        'source-layer': 'road_mid',
        minzoom: 11,
        paint: { 'line-color': color.roadMid, 'line-width': width([[11, 1], [19, 16]]) },
      },
      {
        id: 'road_major_casing',
        type: 'line',
        source: 'mashhad',
        'source-layer': 'road_major',
        paint: { 'line-color': color.roadMajorCasing, 'line-width': width([[9, 2], [19, 26]]) },
      },
      {
        id: 'road_major',
        type: 'line',
        source: 'mashhad',
        'source-layer': 'road_major',
        paint: { 'line-color': color.roadMajor, 'line-width': width([[9, 1], [19, 21]]) },
      },
      {
        id: 'poi',
        type: 'circle',
        source: 'mashhad',
        'source-layer': 'poi',
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
