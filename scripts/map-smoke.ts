/**
 * دود-تست خط لوله‌ی نقشه.
 *
 * ثابت می‌کند که از GeoJSONهای استخراج‌شده، تایل واقعیِ MVT بیرون می‌آید و
 * تایل‌ها در جایی که کافه هست خالی نیستند — همان چیزی که بدون باز کردن
 * مرورگر نمی‌شود مطمئن شد.
 */

import { buildTile, getMapMeta, isMapReady, LAYER_IDS } from '../src/core/map/tiles'
import { getMapLabels } from '../src/core/map/labels'
import { buildDirectionLinks } from '../src/core/map/directions'
import { buildMapStyle } from '../src/core/map/style'

/** تبدیل مختصات به شماره‌ی تایل — همان فرمول استاندارد Web Mercator. */
function lngLatToTile(lng: number, lat: number, zoom: number): { x: number; y: number } {
  const n = 2 ** zoom
  const x = Math.floor(((lng + 180) / 360) * n)
  const latRad = (lat * Math.PI) / 180
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  )
  return { x, y }
}

let failures = 0
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

check('داده‌ی نقشه موجود است', isMapReady())

const meta = getMapMeta()
check('meta.json خوانده شد', !!meta, meta ? `${meta.layers.length} لایه` : '')
if (meta) {
  const total = meta.layers.reduce((sum, layer) => sum + layer.features, 0)
  check('عارضه‌ها استخراج شده‌اند', total > 50_000, `${total.toLocaleString('fa-IR')} عارضه`)
}

// مرکز مشهد (حرم) — پرترددترین نقطه‌ی شهر، قطعاً باید داده داشته باشد.
const HARAM = { lat: 36.2879, lng: 59.6157 }
for (const zoom of [11, 13, 15, 16]) {
  const { x, y } = lngLatToTile(HARAM.lng, HARAM.lat, zoom)
  const started = Date.now()
  const tile = buildTile(zoom, x, y)
  const ms = Date.now() - started
  check(
    `تایل زوم ${zoom} (${x},${y}) ساخته شد`,
    !!tile && tile.byteLength > 200,
    tile ? `${(tile.byteLength / 1024).toFixed(1)} KB در ${ms}ms` : 'خالی',
  )
}

// وکیل‌آباد — پرکافه‌ترین محله (۳۹ کافه)
const VAKILABAD = { lat: 36.3298, lng: 59.479 }
const vTile = lngLatToTile(VAKILABAD.lng, VAKILABAD.lat, 15)
const vBuffer = buildTile(15, vTile.x, vTile.y)
check('تایل وکیل‌آباد در زوم ۱۵', !!vBuffer && vBuffer.byteLength > 200)

// بیرون از کادر — باید خالی باشد، نه اینکه بترکد.
const outside = lngLatToTile(51.4, 35.7, 13) // تهران
check('تایلِ بیرون کادر خالی برمی‌گردد', buildTile(13, outside.x, outside.y) === null)

// زوم غیرمجاز
check('زوم پایین‌تر از حد، خالی برمی‌گردد', buildTile(5, 1, 1) === null)

const labels = getMapLabels({ zoom: 14 })
check('برچسب محله بارگذاری شد', labels.length > 5, `${labels.length} برچسب`)
if (labels.length > 0) {
  console.log(`  نمونه: ${labels.slice(0, 6).map((l) => l.name).join(' · ')}`)
}

const style = buildMapStyle({ theme: 'light' })
const layers = (style.layers as { id: string }[]).map((layer) => layer.id)
check('استایل ساخته شد', layers.length > 8, `${layers.length} لایه`)
check(
  'استایل هیچ منبع بیرونی ندارد',
  !JSON.stringify(style).includes('http://') && !JSON.stringify(style).includes('https://'),
)
check(
  'هر لایه‌ی داده در استایل استفاده شده',
  LAYER_IDS.every((id) => JSON.stringify(style).includes(id)),
)

const links = buildDirectionLinks({ lat: HARAM.lat, lng: HARAM.lng, name: 'حرم' })
check('لینک مسیریابی ساخته شد', links.length >= 4, links.map((l) => l.label).join(' · '))
check(
  'نشان و گوگل هر دو هستند',
  links.some((l) => l.id === 'neshan') && links.some((l) => l.id === 'google'),
)
check(
  'مختصات در لینک‌ها درست است (عرض اول)',
  links.every((link) => link.href.includes('36.2879') || link.href.includes('36.287900')),
)

console.log(failures === 0 ? '\nهمه‌ی بررسی‌ها موفق.' : `\n${failures} بررسی شکست خورد.`)
process.exit(failures === 0 ? 0 : 1)
