/**
 * دود-تست خط لوله‌ی نقشه.
 *
 * ═══ چه چیزی عوض شد ═══
 *
 * نسخه‌ی قبلی تایل‌های MVT را می‌ساخت و اندازه‌شان را می‌سنجید. آن خط لوله
 * برداشته شد (`scripts/map-publish.mjs` و `src/core/map/style.ts` را ببینید)،
 * پس این تست حالا همان سؤال را از **خروجیِ منتشرشده** می‌پرسد: آیا کلاینت
 * فایل‌های سالم و غیرخالی می‌گیرد، و آیا استایل به همان‌ها اشاره می‌کند.
 *
 * بدون این، خرابیِ انتشار فقط در مرورگر و به‌شکل «نقشه‌ی خالی» دیده می‌شد.
 */

import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { getMapLabels } from '../src/core/map/labels'
import { buildDirectionLinks } from '../src/core/map/directions'
import {
  BUILDING_SOURCE,
  buildMapStyle,
  buildingLayerSpec,
  EAGER_LAYERS,
} from '../src/core/map/style'
import { getPublishedMap, isMapPublished } from '../src/core/map/published'

let failures = 0
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

const MAP_DIR = resolve(process.cwd(), 'public', 'map')
const kb = (bytes: number) => `${(bytes / 1024).toFixed(0)} KB`

// ── انتشار

check('نقشه منتشر شده است', isMapPublished(), 'public/map/manifest.json')

const published = getPublishedMap()
if (!published) {
  console.log('\nنقشه منتشر نشده. اجرا کنید: npm run map:publish')
  process.exit(1)
}

check(
  'مانیفست همه‌ی لایه‌های استایل را دارد',
  EAGER_LAYERS.every((layer) => layer in published.layers),
  `${Object.keys(published.layers).length} لایه`,
)

check(
  'لایه‌ی ساختمان منتشر و «تنبل» علامت خورده',
  published.layers[BUILDING_SOURCE]?.lazy === true,
)

/*
  سقفِ بارِ اول.

  عدد ثابت است تا اگر کسی لایه‌ی سنگینی به `KEEP` اضافه کرد، همین‌جا قرمز شود
  نه در گزارشِ سرعتِ سایت سه ماه بعد. یک مگابایت gzip سخت‌گیرانه ولی
  دست‌ودل‌باز است: اندازه‌گیریِ فعلی ۶۷۵ کیلوبایت است.
*/
const EAGER_BUDGET = 1024 * 1024
check(
  'بارِ اولِ نقشه زیر سقف است',
  published.eagerGzip < EAGER_BUDGET,
  `${kb(published.eagerGzip)} gzip از سقف ${kb(EAGER_BUDGET)}`,
)
console.log(`  تنبل (فقط با زوم): ${kb(published.lazyGzip)} gzip`)
console.log(`  مجموع عارضه: ${published.totalFeatures.toLocaleString('fa-IR')}`)

// ── خودِ فایل‌ها

for (const layer of [...EAGER_LAYERS, BUILDING_SOURCE]) {
  const path = resolve(MAP_DIR, `${layer}.geojson`)
  if (!existsSync(path)) {
    check(`فایل ${layer}.geojson`, false, 'نیست')
    continue
  }
  const size = statSync(path).size
  let features = -1
  let valid = false
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as {
      type?: string
      features?: unknown[]
    }
    valid = parsed.type === 'FeatureCollection' && Array.isArray(parsed.features)
    features = parsed.features?.length ?? 0
  } catch {
    valid = false
  }
  check(
    `${layer}.geojson سالم و غیرخالی`,
    valid && features > 0 && size > 200,
    `${features.toLocaleString('fa-IR')} عارضه · ${kb(size)}`,
  )
}

// ── استایل

const style = buildMapStyle({ theme: 'light' })
const layers = (style.layers as { id: string }[]).map((layer) => layer.id)
const sources = Object.keys(style.sources as Record<string, unknown>)

check('استایل ساخته شد', layers.length > 8, `${layers.length} لایه · ${sources.length} منبع`)

check(
  'هر منبعِ استایل یک فایل منتشرشده دارد',
  sources.every((source) => existsSync(resolve(MAP_DIR, `${source}.geojson`))),
  sources.join(' · '),
)

check(
  'ساختمان در استایلِ پایه نیست (تنبل بارگذاری می‌شود)',
  !sources.includes(BUILDING_SOURCE),
)

const buildings = buildingLayerSpec('light', 15.5)
check(
  'مشخصاتِ لایه‌ی تنبلِ ساختمان ساخته می‌شود',
  (buildings.source as { data?: string }).data === `/map/${BUILDING_SOURCE}.geojson` &&
    (buildings.layer as { minzoom?: number }).minzoom === 15.5,
)

/*
  هیچ آدرس بیرونی — نقشه باید آفلاین کار کند. `attribution` عمداً متن ساده
  است و لینک ندارد، وگرنه همین بررسی را می‌شکست.
*/
const styleJson = JSON.stringify(style)
check(
  'استایل هیچ منبع بیرونی ندارد',
  !styleJson.includes('http://') && !styleJson.includes('https://'),
)

check(
  'همه‌ی منابع به مسیر نسبیِ /map می‌روند',
  sources.every((source) =>
    ((style.sources as Record<string, { data: string }>)[source]!.data ?? '').startsWith('/map/'),
  ),
)

// ── برچسب محله (نشانگر DOM، نه لایه‌ی MapLibre)

const labels = getMapLabels({ zoom: 14 })
check('برچسب محله بارگذاری شد', labels.length > 5, `${labels.length} برچسب`)
if (labels.length > 0) {
  console.log(`  نمونه: ${labels.slice(0, 6).map((l) => l.name).join(' · ')}`)
}

// ── مسیریابی

const HARAM = { lat: 36.2879, lng: 59.6157 }
const links = buildDirectionLinks({ lat: HARAM.lat, lng: HARAM.lng, name: 'حرم' })
check('لینک مسیریابی ساخته شد', links.length >= 4, links.map((l) => l.label).join(' · '))
check(
  'نشان و گوگل هر دو هستند',
  links.some((l) => l.id === 'neshan') && links.some((l) => l.id === 'google'),
)
check(
  'مختصات در لینک‌ها درست است (عرض اول)',
  links.every((link) => link.href.includes('36.287900')),
)

console.log(failures === 0 ? '\nهمه‌ی بررسی‌ها موفق.' : `\n${failures} بررسی شکست خورد.`)
process.exit(failures === 0 ? 0 : 1)
