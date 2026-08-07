/**
 * انتشار لایه‌های نقشه به `public/map/` برای مصرف مستقیم کلاینت.
 *
 *   node scripts/map-publish.mjs
 *
 * ═══ چرا این اسکریپت جای سرو تایل را گرفت ═══
 *
 * قبلاً نقشه از `/api/map/tiles/{z}/{x}/{y}` تغذیه می‌شد: هر درخواست، تایل را
 * از GeoJSONِ ایندکس‌شده در حافظه می‌ساخت. سه مشکل داشت:
 *
 *   ۱. **ساخت سردِ کند.** کامنت خودِ `CafeMap` می‌گفت بارِ اول تا ۲۵ ثانیه هم
 *      دیده شده. کاربر «در حال آماده‌سازی نقشه…» می‌دید و می‌رفت.
 *   ۲. **CPU سرور به‌ازای هر پن و زوم.** هر جابه‌جایی نقشه ده‌ها تایل تازه
 *      می‌خواست و همه در Node ساخته می‌شدند.
 *   ۳. **حجمِ واقعیِ بالا.** تایل z13 مرکز مشهد ۱۱۷ کیلوبایت بود و یک کادر
 *      معمولی ۴ تا ۹ تایل می‌خواهد — یعنی تا ~۱ مگابایت برای *یک* نما، و
 *      دوباره برای نمای بعدی.
 *
 * حالا لایه‌ها یک‌بار به‌شکل GeoJSON دانلود می‌شوند و MapLibre خودش در worker
 * مرورگر تایلشان می‌کند. بعد از آن پن و زوم **هیچ درخواست شبکه‌ای** ندارد و
 * سرور هیچ CPUای صرف نقشه نمی‌کند. فایل‌ها استاتیک‌اند، پس nginx مستقیم و با
 * gzip سروشان می‌کند و Node اصلاً درگیر نمی‌شود.
 *
 * ═══ کدام لایه‌ها و چرا ═══
 *
 * سه دسته:
 *
 *   `KEEP`  بارِ اول — ۶۷۵ کیلوبایت gzip (اندازه‌گیری‌شده)
 *   `LAZY`  منتشر می‌شود ولی فقط با زوم بارگذاری می‌شود — ۶۴۰ کیلوبایت gzip
 *   بقیه    اصلاً منتشر نمی‌شوند
 *
 * `road_minor` (۷MB)، `road_path` و `road_service` با هم ۱۰ مگابایت از ۱۸.۳
 * مگابایتِ منبع‌اند و برای کارِ این نقشه — «این کافه کجای شهر است و از کدام
 * بلوار می‌روم» — تصمیم‌ساز نیستند. مسیریابیِ واقعی در نشان و گوگل انجام
 * می‌شود (`src/core/map/directions.ts`)، پس این نقشه ابزارِ جهت‌یابی است نه
 * ناوبری.
 *
 * `place_label` هم منتشر نمی‌شود چون نامِ محله‌ها به‌شکل نشانگر DOM روی نقشه
 * می‌نشیند (`getMapLabels` سمت سرور می‌خواندش) — لایه‌ی MapLibre برایش لازم
 * نیست.
 *
 * اگر جزئیات بیشتری خواستید، نام لایه را به `KEEP` یا `LAZY` اضافه کنید —
 * اسکریپت حجمِ هر دو سبد را چاپ می‌کند تا تصمیم با عدد گرفته شود نه با حدس.
 */

import { gzipSync } from 'node:zlib'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

const SOURCE_DIR = join(process.cwd(), 'src', 'data', 'map')
const OUT_DIR = join(process.cwd(), 'public', 'map')

/**
 * لایه‌هایی که به کلاینت می‌روند.
 *
 * ترتیب مهم نیست — ترتیبِ رسمِ لایه‌ها در `src/core/map/style.ts` تعیین
 * می‌شود، اینجا فقط فهرستِ فایل‌هاست.
 */
const KEEP = [
  'water',
  'waterway',
  'green',
  'aeroway',
  'road_major',
  'road_mid',
  'road_link',
  'poi',
]

/**
 * لایه‌هایی که منتشر می‌شوند ولی **در بارگذاری اول نمی‌آیند**.
 *
 * ═══ چرا ساختمان‌ها اینجاست و نه در `KEEP` ═══
 *
 * `building` بعد از گِردکردن هم سنگین‌ترین لایه است و بردنش به بارِ اول،
 * پرداختِ آن حجم برای **همه‌ی** بازدیدکننده‌هاست — در حالی که ساختمان‌ها فقط
 * از زوم ۱۵.۵ به بالا دیده می‌شوند و بیشتر کاربران هرگز آن‌قدر زوم نمی‌کنند.
 *
 * حذفِ کاملشان هم گزینه نبود: تنظیمِ «زوم نمایش ساختمان» در پنل ادمین وجود
 * دارد و بی‌اثر کردنش یعنی یک کنترلِ دروغین در پنل. پس `CafeMap` این لایه را
 * در اولین باری که کاربر از آن زوم رد شد، با `addSource` اضافه می‌کند —
 * فیچر سر جایش، هزینه فقط برای کسی که واقعاً می‌بیندش.
 */
const LAZY = ['building']

/**
 * دقتِ مختصات، به رقم اعشار.
 *
 * ۵ رقم ≈ ۱.۱ متر روی زمین — برای نقشه‌ی شهری بیش از کافی. منبع تا ۷ رقم
 * دارد که ≈ ۱ سانتی‌متر است و فقط بایت هدر می‌دهد. همین یک تغییر حدود یک‌سومِ
 * حجم را می‌برد.
 */
const PRECISION = 5

/** گِردکردنِ بازگشتیِ آرایه‌های مختصات، با هر عمقی. */
function roundCoords(value) {
  if (typeof value === 'number') {
    return Number(value.toFixed(PRECISION))
  }
  if (Array.isArray(value)) {
    return value.map(roundCoords)
  }
  return value
}

/**
 * حذف ویژگی‌هایی که در استایل استفاده نمی‌شوند.
 *
 * استخراج‌کننده هر تگ OSM را که دیده نگه داشته؛ استایل ما فقط `name` و `kind`
 * را می‌خواند. بقیه بایتِ مرده‌اند و در ۴۰ هزار فیچر جمع می‌شوند.
 */
const KEEP_PROPS = new Set(['name', 'kind', 'class', 'type'])

function trimProperties(properties) {
  if (!properties) return undefined
  const out = {}
  for (const [key, value] of Object.entries(properties)) {
    if (!KEEP_PROPS.has(key)) continue
    if (value === null || value === undefined || value === '') continue
    out[key] = value
  }
  return Object.keys(out).length > 0 ? out : undefined
}

/*
  همگام و نه جریانی: نسخه‌ی جریانیِ اول با `pipeline` قبل از شلیک‌شدنِ همه‌ی
  رویدادهای `data` resolve می‌شد و برای فایل‌های کوچک «۰ KB» چاپ می‌کرد — یعنی
  عددی که تصمیمِ «کدام لایه بماند» را بر آن گذاشته بودیم، غلط بود.
*/
function gzipSize(text) {
  return gzipSync(Buffer.from(text), { level: 9 }).length
}

const kb = (bytes) => `${(bytes / 1024).toFixed(0)} KB`

async function main() {
  if (!existsSync(SOURCE_DIR)) {
    console.error(`✗ ${SOURCE_DIR} نیست. اول اجرا کنید: npm run map:extract`)
    process.exit(1)
  }

  mkdirSync(OUT_DIR, { recursive: true })

  /*
    پاک‌سازیِ خروجیِ قبلی.

    بدون این، لایه‌ای که از `KEEP` برداشته می‌شود فایلش در `public/map/`
    می‌ماند: nginx همچنان سروش می‌کند، `manifest.json` نمی‌شناسدش، و روی
    دیسکِ سرور مگابایت‌ها زبالهٔ خاموش جمع می‌شود. یک بار همین اتفاق با
    `place_label` افتاد.
  */
  let removed = 0
  for (const file of readdirSync(OUT_DIR)) {
    if (file.endsWith('.geojson') || file === 'manifest.json') {
      rmSync(join(OUT_DIR, file))
      removed++
    }
  }

  const available = readdirSync(SOURCE_DIR)
    .filter((file) => file.endsWith('.geojson'))
    .map((file) => file.replace(/\.geojson$/, ''))

  const publish = [...KEEP, ...LAZY]
  const missing = publish.filter((layer) => !available.includes(layer))
  if (missing.length > 0) {
    console.error(`✗ این لایه‌ها در منبع نیستند: ${missing.join(', ')}`)
    console.error(`  موجود: ${available.join(', ')}`)
    process.exit(1)
  }

  const skipped = available.filter((layer) => !publish.includes(layer))

  console.log('انتشار لایه‌های نقشه → public/map/')
  if (removed > 0) console.log(`  (${removed} فایل قبلی پاک شد)`)
  console.log('')

  let rawTotal = 0
  let outTotal = 0
  let gzTotal = 0
  let eagerGz = 0
  let lazyGz = 0
  let featureTotal = 0
  const manifest = {}

  for (const layer of publish) {
    const sourcePath = join(SOURCE_DIR, `${layer}.geojson`)
    const rawSize = statSync(sourcePath).size
    const geojson = JSON.parse(readFileSync(sourcePath, 'utf8'))

    const features = (geojson.features ?? []).map((feature) => {
      const next = {
        type: 'Feature',
        geometry: feature.geometry
          ? { type: feature.geometry.type, coordinates: roundCoords(feature.geometry.coordinates) }
          : null,
      }
      const properties = trimProperties(feature.properties)
      if (properties) next.properties = properties
      return next
    })

    // بدون فاصله‌گذاری: این فایل خوانده‌ی ماشین است، نه آدم.
    const text = JSON.stringify({ type: 'FeatureCollection', features })
    writeFileSync(join(OUT_DIR, `${layer}.geojson`), text)

    const gz = gzipSize(text)
    rawTotal += rawSize
    outTotal += Buffer.byteLength(text)
    gzTotal += gz
    featureTotal += features.length
    const lazy = LAZY.includes(layer)
    manifest[layer] = {
      features: features.length,
      bytes: Buffer.byteLength(text),
      gzip: gz,
      lazy,
    }
    if (lazy) lazyGz += gz
    else eagerGz += gz

    console.log(
      `  ${layer.padEnd(13)} ${String(features.length).padStart(7)} فیچر  ` +
        `منبع ${kb(rawSize).padStart(8)} → خروجی ${kb(Buffer.byteLength(text)).padStart(8)} ` +
        `(gzip ${kb(gz)})${lazy ? '  ← تنبل' : ''}`,
    )
  }

  /*
    مانیفست، تنها منبعِ «نقشه منتشر شده یا نه» است.

    قبلاً `isMapReady()` وجودِ فایل‌های `src/data/map` را چک می‌کرد — یعنی
    وجودِ *منبع*، نه وجودِ چیزی که کلاینت می‌خواند. با این فایل، پنل ادمین
    واقعاً همان چیزی را می‌سنجد که مرورگر می‌گیرد.
  */
  writeFileSync(
    join(OUT_DIR, 'manifest.json'),
    `${JSON.stringify({ layers: manifest, precision: PRECISION }, null, 2)}\n`,
  )

  console.log('\n  ' + '─'.repeat(70))
  console.log(
    `  مجموع        ${String(featureTotal).padStart(7)} فیچر  ` +
      `منبع ${kb(rawTotal).padStart(8)} → خروجی ${kb(outTotal).padStart(8)} (gzip ${kb(gzTotal)})`,
  )
  console.log(
    `  بارِ اولِ کلاینت: ${kb(eagerGz)} gzip  ·  تنبل (فقط با زوم): ${kb(lazyGz)} gzip`,
  )
  if (skipped.length > 0) {
    console.log(`\n  کنار گذاشته شد: ${skipped.join('، ')}`)
    console.log('  (برای افزودن، نام لایه را به KEEP در همین فایل اضافه کنید)')
  }
  console.log('\n✓ نقشه منتشر شد. nginx این‌ها را با gzip و کشِ یک‌ساله سرو می‌کند.')
}

main().catch((error) => {
  console.error('✗ انتشار نقشه شکست خورد:', error)
  process.exit(1)
})
