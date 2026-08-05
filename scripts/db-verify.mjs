/**
 * بررسی سلامت ساختار دیتابیس.
 *
 *   npm run db:verify
 *
 * ═══ چرا این اسکریپت وجود دارد ═══
 *
 * `drizzle-kit push` ایندکس‌های FULLTEXT را **بی‌صدا می‌اندازد**، چون در
 * `schema.ts` تعریف نشده‌اند (drizzle آن‌ها را تولید نمی‌کند). نتیجه‌اش یک
 * خرابیِ دیرآشکار است: جست‌وجوی سایت با
 * `ER_FT_MATCHING_KEY_NOT_FOUND` می‌شکند، ولی فقط وقتی کسی جست‌وجو کند.
 *
 * همین اتفاق در همین پروژه افتاد و با دود-تست پیدا شد. حالا `npm run db:push`
 * خودش `db:extras` را پشت سرش اجرا می‌کند، و این اسکریپت بررسی نهایی است.
 */

import { readFileSync } from 'node:fs'
import mysql from 'mysql2/promise'

function envValue(key) {
  if (process.env[key]) return process.env[key]
  try {
    const text = readFileSync('.env.local', 'utf8')
    const line = text.split(/\r?\n/).find((row) => row.startsWith(`${key}=`))
    return line?.slice(key.length + 1).trim()
  } catch {
    return undefined
  }
}

const url = envValue('DATABASE_URL')
if (!url) {
  console.error('DATABASE_URL پیدا نشد.')
  process.exit(1)
}

const conn = await mysql.createConnection({ uri: url, charset: 'utf8mb4' })
let failures = 0
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

// ── جدول‌ها
const [tables] = await conn.query(
  `SELECT TABLE_NAME, TABLE_COLLATION FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()`,
)
const names = new Set(tables.map((row) => row.TABLE_NAME))
const REQUIRED = [
  'place', 'menu_section', 'menu_item', 'media', 'district', 'facet', 'dish',
  'place_facet', 'place_dish', 'place_hours', 'place_phone', 'place_social',
  'app_user', 'user_place_role', 'user_taste_profile', 'user_preference',
  'saved_place', 'review', 'place_submission', 'page_view', 'search_log',
  'audit_log', 'impersonation_log', 'otp_code',
]
const missing = REQUIRED.filter((table) => !names.has(table))
check(`${REQUIRED.length} جدول لازم موجود است`, missing.length === 0, missing.join(', '))

const wrongCollation = tables.filter(
  (row) => row.TABLE_COLLATION && !row.TABLE_COLLATION.startsWith('utf8mb4'),
)
check(
  'همه‌ی جدول‌ها utf8mb4 هستند',
  wrongCollation.length === 0,
  wrongCollation.map((row) => row.TABLE_NAME).join(', '),
)

// ── ایندکس FULLTEXT — همان چیزی که push می‌اندازد
const [fulltext] = await conn.query(
  `SELECT DISTINCT TABLE_NAME, INDEX_NAME FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND INDEX_TYPE = 'FULLTEXT'`,
)
const ftNames = new Set(fulltext.map((row) => row.INDEX_NAME))
for (const index of ['place_name_ft', 'menu_item_name_ft', 'review_text_ft']) {
  check(
    `ایندکس FULLTEXT ${index}`,
    ftNames.has(index),
    ftNames.has(index) ? '' : 'اجرا کنید: npm run db:extras',
  )
}

// ── منطقه‌ی زمانی
const [[tz]] = await conn.query(`SELECT @@time_zone AS tz, NOW() AS now, UTC_TIMESTAMP() AS utc`)
check(
  'منطقه‌ی زمانی سرور UTC است',
  tz.tz === '+00:00' || tz.tz === 'UTC',
  `${tz.tz} — اگر UTC نباشد همه‌ی تایم‌استمپ‌ها جابه‌جا خوانده می‌شوند`,
)

// ── داده
const [[counts]] = await conn.query(`
  SELECT
    (SELECT COUNT(*) FROM place) AS places,
    (SELECT COUNT(*) FROM menu_item) AS items,
    (SELECT COUNT(*) FROM media WHERE status = 'ok') AS media_ok,
    (SELECT COUNT(*) FROM facet) AS facets,
    (SELECT COUNT(*) FROM dish) AS dishes,
    (SELECT COUNT(*) FROM place_facet) AS place_facets,
    (SELECT COUNT(*) FROM app_user WHERE role = 'admin') AS admins
`)
check('مکان‌ها وارد شده‌اند', counts.places > 300, `${counts.places} مکان`)
check('منو وارد شده', counts.items > 19000, `${counts.items} آیتم`)
check('تصاویر دانلود شده‌اند', counts.media_ok > 14000, `${counts.media_ok} تصویر`)
check('واژگان ساخته شده', counts.facets > 30 && counts.dishes > 90, `${counts.facets} facet · ${counts.dishes} دیش`)
check('رول‌آپ facet پر است', counts.place_facets > 2000, `${counts.place_facets} ردیف`)
check('حداقل یک مدیر وجود دارد', counts.admins > 0, `${counts.admins} مدیر`)

await conn.end()
console.log(failures === 0 ? '\nساختار دیتابیس سالم است.' : `\n${failures} مشکل پیدا شد.`)
process.exit(failures === 0 ? 0 : 1)
