import 'server-only'

/**
 * برچسب‌های جهت‌یابی روی نقشه.
 *
 * تایل‌ها لایه‌ی متنی ندارند (گلیف SDF فارسی وابستگی بومی می‌خواست — توضیح
 * در `style.ts`). پس نام محله‌ها و نقاط شاخص از همین‌جا به کلاینت می‌روند و
 * به‌صورت عنصر DOM روی نقشه می‌نشینند.
 *
 * ═══ چرا فهرست محدود ═══
 *
 * استخراج ۵۱۳ برچسب مکان و ۱٬۱۳۱ نقطه‌ی شاخص از OSM بیرون آمد. فرستادن همه،
 * هم نقشه را با متن پر می‌کند و هم ۱۵۰ کیلوبایت به هر صفحه اضافه می‌کند.
 * فیلتر بر اساس **رتبه‌ی مکان** و زوم انجام می‌شود: در زوم شهری فقط شهر و
 * منطقه، در زوم نزدیک محله‌ها هم.
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const DATA_DIR = resolve(process.cwd(), 'src/data/map')

export interface MapLabel {
  name: string
  lat: number
  lng: number
  kind: string
  rank: number
}

interface LabelCache {
  labels?: MapLabel[]
}

const cache = globalThis as unknown as { __cafegardMapLabels?: LabelCache }
cache.__cafegardMapLabels ??= {}

interface GeoJsonFeature {
  properties: { name?: string; kind?: string; rank?: number }
  geometry: { coordinates: [number, number] }
}

function loadAll(): MapLabel[] {
  if (cache.__cafegardMapLabels!.labels) return cache.__cafegardMapLabels!.labels

  const path = resolve(DATA_DIR, 'place_label.geojson')
  if (!existsSync(path)) {
    cache.__cafegardMapLabels!.labels = []
    return []
  }

  const data = JSON.parse(readFileSync(path, 'utf8')) as { features: GeoJsonFeature[] }
  const labels: MapLabel[] = []
  const seen = new Set<string>()

  for (const feature of data.features) {
    const name = feature.properties.name?.trim()
    if (!name) continue
    // نام تکراری در OSM زیاد است (یک محله با چند نقطه). اولی می‌ماند.
    if (seen.has(name)) continue
    seen.add(name)
    labels.push({
      name,
      kind: feature.properties.kind ?? 'neighbourhood',
      rank: feature.properties.rank ?? 4,
      lng: feature.geometry.coordinates[0],
      lat: feature.geometry.coordinates[1],
    })
  }

  labels.sort((a, b) => a.rank - b.rank)
  cache.__cafegardMapLabels!.labels = labels
  return labels
}

/**
 * برچسب‌های مناسب یک زوم.
 *
 * `maxRank` از زوم مشتق می‌شود: ۱ شهر · ۲ شهرک · ۳ منطقه · ۴ محله.
 */
export function getMapLabels(options: { zoom?: number; limit?: number } = {}): MapLabel[] {
  const { zoom = 12, limit = 60 } = options
  const maxRank = zoom >= 14 ? 4 : zoom >= 12 ? 3 : 2
  return loadAll()
    .filter((label) => label.rank <= maxRank)
    .slice(0, limit)
}

/** همه‌ی برچسب‌ها — برای پنل ادمین و بازبینی داده. */
export function countMapLabels(): number {
  return loadAll().length
}
