import 'server-only'

/**
 * تولید تایل برداری از GeoJSONهای استخراج‌شده‌ی مشهد.
 *
 * ═══ چرا خودمان تایل می‌سازیم ═══
 *
 * نقشه باید **آفلاین** باشد: هیچ درخواستی به Mapbox، گوگل یا نشان نرود. سه
 * راه داشتیم:
 *
 *   ۱. تایل رستری از قبل رندرشده — نیاز به ابزار رندر بومی (mapnik) دارد که
 *      روی این ماشین بدون زنجیره‌ی build نصب نمی‌شود، و حجمش برای کل شهر در
 *      همه‌ی زوم‌ها چند گیگابایت است.
 *   ۲. تولید MBTiles/PMTiles با tilemaker — باینری C++، همان مشکل.
 *   ۳. **همین راه**: GeoJSON را با `geojson-vt` ایندکس می‌کنیم و تایل MVT را
 *      با `vt-pbf` در لحظه می‌سازیم. کاملاً جاوااسکریپت، بدون وابستگی بومی.
 *
 * ایندکس یک‌بار ساخته و در حافظه‌ی فرآیند کش می‌شود؛ ساختنش چند ثانیه است و
 * بعد از آن هر تایل در حد میلی‌ثانیه تولید می‌شود.
 *
 * ═══ چرا بدون برچسب متنی ═══
 *
 * MapLibre برای نوشتن متن روی نقشه به گلیف SDF نیاز دارد و تولیدشان به
 * `fontnik` (وابستگی بومی) نیاز دارد. پس لایه‌ی متنی در تایل‌ها نیست؛
 * نام محله‌ها، نقاط شاخص و کافه‌ها به‌صورت **عنصر DOM** روی نقشه گذاشته
 * می‌شوند — همان‌ها که واقعاً باید خوانده شوند. جزئیات در
 * `task/06-offline-map/REPORT.md`.
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import geojsonvt from 'geojson-vt'
import vtpbf from 'vt-pbf'

const DATA_DIR = resolve(process.cwd(), 'src/data/map')

/** بیشترین زوم که ایندکس می‌شود. بالاتر از آن، تایل زوم ۱۶ کشیده می‌شود. */
export const MAX_INDEX_ZOOM = 16
export const MIN_ZOOM = 9
export const MAX_ZOOM = 19

/**
 * لایه‌ها با زوم شروع.
 *
 * بدون `minzoom`، در زوم شهری صدهزار خط و ساختمان روی هم می‌افتند: نقشه هم
 * ناخوانا می‌شود هم کند. اعداد از آزمایش چشمی روی خودِ داده آمده‌اند.
 */
const LAYERS: { id: string; minzoom: number }[] = [
  { id: 'water', minzoom: 9 },
  { id: 'green', minzoom: 11 },
  { id: 'aeroway', minzoom: 11 },
  { id: 'waterway', minzoom: 12 },
  { id: 'road_major', minzoom: 9 },
  { id: 'road_mid', minzoom: 11 },
  { id: 'road_link', minzoom: 12 },
  { id: 'road_minor', minzoom: 13 },
  { id: 'road_service', minzoom: 15 },
  { id: 'road_path', minzoom: 15 },
  // ساختمان‌ها فقط در زوم نزدیک — پرحجم‌ترین لایه‌اند و در زوم شهری
  // چیزی جز خاکستریِ یکدست نمی‌سازند.
  { id: 'building', minzoom: 16 },
  { id: 'poi', minzoom: 14 },
]

export const LAYER_IDS = LAYERS.map((layer) => layer.id)

interface TileIndex {
  getTile(z: number, x: number, y: number): { features: unknown[] } | null
}

interface MapCache {
  indexes?: Map<string, TileIndex>
  meta?: MapMeta
  /** کش تایلِ ساخته‌شده — کلید `z/x/y`. */
  tiles?: Map<string, Buffer | null>
}

/**
 * سقف کش تایل.
 *
 * ساختن یک تایل زوم پایین حدود ۱ ثانیه است (کلیپ‌کردن ۳۵هزار خط)، پس
 * بدون کش هر جابه‌جایی نقشه چند ثانیه طول می‌کشد. با کش، دیدنِ دوباره‌ی
 * همان ناحیه بی‌هزینه است.
 *
 * ۳٬۰۰۰ تایل × میانگین ~۲۰ کیلوبایت ≈ ۶۰ مگابایت — قابل قبول برای سروری که
 * کل داده‌ی نقشه‌اش ۱۷ مگابایت است. حذف به‌روش FIFO است نه LRU واقعی: برای
 * الگوی «کاربر یک ناحیه را می‌کاود» تفاوت عملی‌شان ناچیز است و FIFO یک
 * ساختمان‌داده کمتر می‌خواهد.
 */
const TILE_CACHE_MAX = 3_000

export interface MapMeta {
  bbox: { minLat: number; maxLat: number; minLng: number; maxLng: number }
  extractedAt: string
  layers: { layer: string; features: number }[]
}

const cache = globalThis as unknown as { __cafegardMap?: MapCache }
cache.__cafegardMap ??= {}

/**
 * ایندکس‌ها را می‌سازد (یا از کش می‌دهد).
 *
 * هر لایه ایندکس جدا دارد نه یک ایندکسِ مشترک: با ایندکس مشترک نمی‌شود
 * ساختمان‌ها را در زوم ۱۲ کنار گذاشت و هر تایل مجبور است همه‌ی عارضه‌ها را
 * حمل کند.
 */
function getIndexes(): Map<string, TileIndex> {
  if (cache.__cafegardMap!.indexes) return cache.__cafegardMap!.indexes

  const indexes = new Map<string, TileIndex>()
  for (const layer of LAYERS) {
    const path = resolve(DATA_DIR, `${layer.id}.geojson`)
    if (!existsSync(path)) continue
    const data = JSON.parse(readFileSync(path, 'utf8'))
    indexes.set(
      layer.id,
      geojsonvt(data, {
        maxZoom: MAX_INDEX_ZOOM,
        indexMaxZoom: 5,
        indexMaxPoints: 100_000,
        tolerance: 3,
        extent: 4096,
        // بافر لازم است وگرنه خطوط دقیقاً روی مرز تایل بریده می‌شوند و
        // در محل اتصال دو تایل، شکاف دیده می‌شود.
        buffer: 64,
        generateId: true,
      }) as TileIndex,
    )
  }
  cache.__cafegardMap!.indexes = indexes
  return indexes
}

export function getMapMeta(): MapMeta | null {
  if (cache.__cafegardMap!.meta) return cache.__cafegardMap!.meta
  const path = resolve(DATA_DIR, 'meta.json')
  if (!existsSync(path)) return null
  const meta = JSON.parse(readFileSync(path, 'utf8')) as MapMeta
  cache.__cafegardMap!.meta = meta
  return meta
}

/** آیا داده‌ی نقشه استخراج شده است؟ برای نمایش وضعیت در پنل ادمین. */
export function isMapReady(): boolean {
  return existsSync(resolve(DATA_DIR, 'meta.json'))
}

/**
 * یک تایل MVT.
 *
 * `null` یعنی این تایل عارضه‌ای ندارد؛ صدازننده باید ۲۰۴ برگرداند نه ۴۰۴ —
 * ۴۰۴ در کنسول مرورگر خطا تولید می‌کند و لاگ را پر می‌کند، در حالی که
 * تایلِ خالی وضعیت کاملاً طبیعی است.
 */
export function buildTile(z: number, x: number, y: number): Buffer | null {
  if (z < MIN_ZOOM || z > MAX_ZOOM) return null

  cache.__cafegardMap!.tiles ??= new Map()
  const tileCache = cache.__cafegardMap!.tiles
  const key = `${z}/${x}/${y}`
  // `has` لازم است نه `get`: تایلِ خالی هم `null` است و باید کش شود، وگرنه
  // ناحیه‌های خالی (بیابان اطراف شهر) هر بار از نو محاسبه می‌شوند.
  if (tileCache.has(key)) return tileCache.get(key)!

  const result = computeTile(z, x, y)

  if (tileCache.size >= TILE_CACHE_MAX) {
    // قدیمی‌ترین کلید — Map در جاوااسکریپت ترتیب درج را نگه می‌دارد.
    const oldest = tileCache.keys().next().value
    if (oldest !== undefined) tileCache.delete(oldest)
  }
  tileCache.set(key, result)
  return result
}

function computeTile(z: number, x: number, y: number): Buffer | null {
  const indexes = getIndexes()
  // بالاتر از زوم ایندکس، همان تایل زوم بیشینه کشیده می‌شود (overzoom).
  const sourceZ = Math.min(z, MAX_INDEX_ZOOM)
  const scale = 2 ** (z - sourceZ)
  const sourceX = Math.floor(x / scale)
  const sourceY = Math.floor(y / scale)

  const tileLayers: Record<string, unknown> = {}
  for (const layer of LAYERS) {
    if (z < layer.minzoom) continue
    const index = indexes.get(layer.id)
    if (!index) continue
    const tile = index.getTile(sourceZ, sourceX, sourceY)
    if (!tile || tile.features.length === 0) continue
    tileLayers[layer.id] = tile
  }

  if (Object.keys(tileLayers).length === 0) return null

  const buffer = vtpbf.fromGeojsonVt(tileLayers, { version: 2, extent: 4096 })
  return Buffer.from(buffer)
}
