/**
 * استخراج نقشه‌ی مشهد از `all-cafe-data/iran-260804.osm.pbf`.
 *
 *   node scripts/map-extract.mjs
 *
 * ═══ چرا استخراج، و چرا این‌طور ═══
 *
 * فایل PBF کل ایران **۲۲۸ مگابایت** است و صدها میلیون نقطه دارد. برای یک
 * راهنمای کافه‌ی مشهد، ۹۹٪ آن دور ریختنی است. این اسکریپت یک‌بار فایل را
 * می‌خواند و فقط چیزهای داخل کادر مشهد را نگه می‌دارد.
 *
 * ═══ دو گذر، چون حافظه ═══
 *
 * فرمت PBF گره‌ها (nodes) را جدا از راه‌ها (ways) نگه می‌دارد و هر راه فقط
 * *شناسه‌ی* گره‌هایش را دارد. برای ساختن هندسه باید مختصات گره‌ها را داشت.
 * نگه‌داشتن همه‌ی گره‌های ایران در حافظه چند گیگابایت می‌شود، پس:
 *
 *   گذر ۱  فقط گره‌های داخل کادر مشهد را در یک Map نگه می‌دارد،
 *          و شناسه‌ی راه‌های موردنیاز را جمع می‌کند.
 *   گذر ۲  راه‌ها را می‌خواند و با همان Map هندسه می‌سازد.
 *
 * گره‌ها در `Float64Array`های تکه‌ای ذخیره می‌شوند نه آبجکت، چون تعدادشان
 * حدود دو میلیون است و هر آبجکت جاوااسکریپت ~۸۰ بایت سرباره دارد.
 */

import { createReadStream, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Transform } from 'node:stream'
import parseOSM from 'osm-pbf-parser'

const SOURCE = resolve(process.cwd(), 'all-cafe-data/iran-260804.osm.pbf')
const OUT_DIR = resolve(process.cwd(), 'src/data/map')

/**
 * کادر مشهد و حومه — کمی بزرگ‌تر از کادر کافه‌ها (`MASHHAD_BBOX`) تا لبه‌ی
 * نقشه خالی نباشد وقتی کاربر تا مرز شهر زوم بیرون می‌زند.
 */
const BBOX = { minLat: 36.05, maxLat: 36.62, minLng: 59.1, maxLng: 59.95 }

const inBox = (lat, lon) =>
  lat >= BBOX.minLat && lat <= BBOX.maxLat && lon >= BBOX.minLng && lon <= BBOX.maxLng

// ── لایه‌بندی ────────────────────────────────────────────────────────

/**
 * فقط راه‌هایی که روی نقشه‌ی شهری دیده می‌شوند.
 *
 * `minzoom` تعیین می‌کند از کدام زوم به بعد لایه رندر شود. بزرگراه‌ها از
 * زوم ۱۰ و کوچه‌ها از ۱۵ — بدون این، در زوم شهری صدهزار خط روی هم می‌افتند
 * و نقشه هم کند می‌شود هم ناخوانا.
 */
const ROAD_CLASSES = {
  motorway: { layer: 'road_major', minzoom: 9 },
  trunk: { layer: 'road_major', minzoom: 9 },
  primary: { layer: 'road_major', minzoom: 10 },
  secondary: { layer: 'road_mid', minzoom: 11 },
  tertiary: { layer: 'road_mid', minzoom: 12 },
  residential: { layer: 'road_minor', minzoom: 13 },
  unclassified: { layer: 'road_minor', minzoom: 14 },
  living_street: { layer: 'road_minor', minzoom: 14 },
  service: { layer: 'road_service', minzoom: 15 },
  pedestrian: { layer: 'road_path', minzoom: 14 },
  footway: { layer: 'road_path', minzoom: 16 },
  path: { layer: 'road_path', minzoom: 16 },
  steps: { layer: 'road_path', minzoom: 16 },
  cycleway: { layer: 'road_path', minzoom: 15 },
  motorway_link: { layer: 'road_link', minzoom: 12 },
  trunk_link: { layer: 'road_link', minzoom: 12 },
  primary_link: { layer: 'road_link', minzoom: 13 },
  secondary_link: { layer: 'road_link', minzoom: 13 },
}

/** سطح‌های پرکردنی: آب، سبز، ساختمان. */
function areaLayerFor(tags) {
  if (tags.natural === 'water' || tags.waterway === 'riverbank' || tags.landuse === 'reservoir') {
    return 'water'
  }
  if (
    tags.leisure === 'park' ||
    tags.leisure === 'garden' ||
    tags.leisure === 'pitch' ||
    tags.landuse === 'grass' ||
    tags.landuse === 'forest' ||
    tags.natural === 'wood'
  ) {
    return 'green'
  }
  if (tags.landuse === 'cemetery' || tags.amenity === 'grave_yard') return 'green'
  if (tags.building) return 'building'
  if (tags.aeroway === 'aerodrome') return 'aeroway'
  return null
}

/** نقاط شاخص شهر — برای اینکه کاربر بفهمد کجای نقشه است. */
function poiKindFor(tags) {
  if (tags.amenity === 'place_of_worship' && tags.religion === 'muslim') return 'shrine'
  if (tags.railway === 'station' || tags.railway === 'subway_entrance') return 'transit'
  if (tags.amenity === 'hospital') return 'hospital'
  if (tags.amenity === 'university' || tags.amenity === 'college') return 'university'
  if (tags.shop === 'mall' || tags.shop === 'department_store') return 'mall'
  if (tags.tourism === 'hotel') return 'hotel'
  if (tags.amenity === 'cafe' || tags.amenity === 'restaurant') return 'food'
  return null
}

const PLACE_RANKS = { city: 1, town: 2, suburb: 3, neighbourhood: 4, quarter: 4, village: 5 }

// ── ذخیره‌ی گره‌ها ───────────────────────────────────────────────────

/**
 * نگاشت شناسه‌ی گره → مختصات.
 *
 * شناسه‌های OSM بزرگ‌تر از `Number.MAX_SAFE_INTEGER` نیستند (فعلاً حدود
 * ۱۲ میلیارد) پس `Map<number, index>` کار می‌کند. مختصات در آرایه‌ی تایپ‌دار
 * می‌نشیند تا سرباره‌ی آبجکت نداشته باشیم.
 */
class NodeStore {
  constructor() {
    this.index = new Map()
    this.chunks = []
    this.chunkSize = 1 << 20
    this.count = 0
  }

  set(id, lat, lon) {
    const i = this.count++
    const chunkIndex = i >>> 20
    if (!this.chunks[chunkIndex]) this.chunks[chunkIndex] = new Float64Array(this.chunkSize * 2)
    const offset = (i % this.chunkSize) * 2
    this.chunks[chunkIndex][offset] = lon
    this.chunks[chunkIndex][offset + 1] = lat
    this.index.set(id, i)
  }

  get(id) {
    const i = this.index.get(id)
    if (i === undefined) return null
    const chunk = this.chunks[i >>> 20]
    const offset = (i % this.chunkSize) * 2
    return [chunk[offset], chunk[offset + 1]]
  }

  get size() {
    return this.index.size
  }
}

// ── گذرها ────────────────────────────────────────────────────────────

function readPbf(onItems) {
  return pipeline(
    createReadStream(SOURCE),
    parseOSM(),
    new Transform({
      objectMode: true,
      transform(items, _enc, callback) {
        onItems(items)
        callback()
      },
    }),
  )
}

const nodes = new NodeStore()
const pointFeatures = []
const placeLabels = []

console.log('گذر ۱: خواندن گره‌ها…')
let seen = 0
const startedPass1 = Date.now()

await readPbf((items) => {
  for (const item of items) {
    seen++
    if (item.type !== 'node') continue
    if (!inBox(item.lat, item.lon)) continue
    nodes.set(item.id, item.lat, item.lon)

    const tags = item.tags ?? {}
    if (tags.place && PLACE_RANKS[tags.place] && (tags['name:fa'] || tags.name)) {
      placeLabels.push({
        name: tags['name:fa'] ?? tags.name,
        kind: tags.place,
        rank: PLACE_RANKS[tags.place],
        lon: item.lon,
        lat: item.lat,
      })
    }
    const poiKind = poiKindFor(tags)
    if (poiKind && (tags['name:fa'] || tags.name)) {
      pointFeatures.push({
        name: tags['name:fa'] ?? tags.name,
        kind: poiKind,
        lon: item.lon,
        lat: item.lat,
      })
    }
  }
  if (seen % 5_000_000 < 8000) {
    process.stdout.write(
      `\r  ${(seen / 1e6).toFixed(0)}M عنصر · ${(nodes.size / 1e3).toFixed(0)}K گره در کادر`,
    )
  }
})
process.stdout.write('\n')
console.log(
  `  ${nodes.size.toLocaleString('fa-IR')} گره در کادر · ${((Date.now() - startedPass1) / 1000).toFixed(0)} ثانیه`,
)

console.log('گذر ۲: خواندن راه‌ها…')
const lineFeatures = []
const areaFeatures = []
let wayCount = 0
const startedPass2 = Date.now()

await readPbf((items) => {
  for (const item of items) {
    if (item.type !== 'way') continue
    const tags = item.tags ?? {}
    const refs = item.refs ?? []
    if (refs.length < 2) continue

    const roadClass = tags.highway ? ROAD_CLASSES[tags.highway] : null
    const areaLayer = areaLayerFor(tags)
    const isWaterway = tags.waterway === 'river' || tags.waterway === 'stream'
    if (!roadClass && !areaLayer && !isWaterway) continue

    // هندسه فقط اگر **همه‌ی** گره‌ها در کادر باشند. یک راهِ نیمه‌بریده
    // خطِ عجیبی به وسط نقشه می‌کشد.
    const coords = []
    let complete = true
    for (const ref of refs) {
      const point = nodes.get(ref)
      if (!point) {
        complete = false
        break
      }
      coords.push([Number(point[0].toFixed(5)), Number(point[1].toFixed(5))])
    }
    if (!complete || coords.length < 2) continue

    wayCount++
    const name = tags['name:fa'] ?? tags.name ?? null

    if (roadClass) {
      lineFeatures.push({
        layer: roadClass.layer,
        minzoom: roadClass.minzoom,
        name,
        coords,
      })
    } else if (isWaterway) {
      lineFeatures.push({ layer: 'waterway', minzoom: 12, name, coords })
    } else if (areaLayer) {
      const closed =
        coords.length > 3 &&
        coords[0][0] === coords[coords.length - 1][0] &&
        coords[0][1] === coords[coords.length - 1][1]
      if (!closed) continue
      areaFeatures.push({ layer: areaLayer, name, coords })
    }
  }
})
console.log(
  `  ${wayCount.toLocaleString('fa-IR')} راه · ${((Date.now() - startedPass2) / 1000).toFixed(0)} ثانیه`,
)

// ── نوشتن GeoJSON به تفکیک لایه ──────────────────────────────────────

const collections = new Map()
const push = (layer, feature) => {
  const list = collections.get(layer)
  if (list) list.push(feature)
  else collections.set(layer, [feature])
}

for (const line of lineFeatures) {
  push(line.layer, {
    type: 'Feature',
    properties: line.name ? { name: line.name, minzoom: line.minzoom } : { minzoom: line.minzoom },
    geometry: { type: 'LineString', coordinates: line.coords },
  })
}
for (const area of areaFeatures) {
  push(area.layer, {
    type: 'Feature',
    properties: area.name ? { name: area.name } : {},
    geometry: { type: 'Polygon', coordinates: [area.coords] },
  })
}
for (const poi of pointFeatures) {
  push('poi', {
    type: 'Feature',
    properties: { name: poi.name, kind: poi.kind },
    geometry: { type: 'Point', coordinates: [Number(poi.lon.toFixed(5)), Number(poi.lat.toFixed(5))] },
  })
}
for (const label of placeLabels) {
  push('place_label', {
    type: 'Feature',
    properties: { name: label.name, kind: label.kind, rank: label.rank },
    geometry: {
      type: 'Point',
      coordinates: [Number(label.lon.toFixed(5)), Number(label.lat.toFixed(5))],
    },
  })
}

mkdirSync(OUT_DIR, { recursive: true })
const summary = []
for (const [layer, features] of collections) {
  const path = resolve(OUT_DIR, `${layer}.geojson`)
  const json = JSON.stringify({ type: 'FeatureCollection', features })
  writeFileSync(path, json, 'utf8')
  summary.push({ layer, features: features.length, mb: json.length / 1024 / 1024 })
}

summary.sort((a, b) => b.features - a.features)
console.log('\n── لایه‌ها ──')
for (const row of summary) {
  console.log(`  ${row.layer.padEnd(14)} ${String(row.features).padStart(7)} عارضه  ${row.mb.toFixed(1)} MB`)
}
const totalMb = summary.reduce((sum, row) => sum + row.mb, 0)
console.log(`  جمع: ${totalMb.toFixed(1)} MB در ${OUT_DIR}`)

writeFileSync(
  resolve(OUT_DIR, 'meta.json'),
  JSON.stringify(
    {
      source: 'iran-260804.osm.pbf',
      bbox: BBOX,
      extractedAt: new Date().toISOString(),
      layers: summary.map((row) => ({ layer: row.layer, features: row.features })),
    },
    null,
    2,
  ),
  'utf8',
)
