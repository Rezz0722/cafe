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
  'audit_log', 'impersonation_log', 'otp_code', 'auth_session', 'place_brand',
  'menu_item_variant',
  'blogger_profile', 'club_membership', 'club_offer', 'club_code',
  'venue_lead', 'venue_lead_rate',
]
const missing = REQUIRED.filter((table) => !names.has(table))
check(`${REQUIRED.length} جدول لازم موجود است`, missing.length === 0, missing.join(', '))

const [reviewTrustColumns] = await conn.query(
  `SELECT COLUMN_NAME FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'review'
     AND COLUMN_NAME IN ('is_blogger_review', 'video_url')`,
)
const reviewTrustNames = new Set(reviewTrustColumns.map((row) => row.COLUMN_NAME))
check(
  'داده‌های بررسی بلاگر کامل است',
  ['is_blogger_review', 'video_url'].every((name) => reviewTrustNames.has(name)),
)

const [clubIndexes] = await conn.query(
  `SELECT TABLE_NAME, INDEX_NAME FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND ((TABLE_NAME = 'club_membership' AND INDEX_NAME = 'club_membership_place_idx')
       OR (TABLE_NAME = 'club_code' AND INDEX_NAME = 'club_code_code_uq'))`,
)
const clubIndexNames = new Set(clubIndexes.map((row) => `${row.TABLE_NAME}.${row.INDEX_NAME}`))
check(
  'ایندکس‌های حیاتی باشگاه مشتریان',
  ['club_membership.club_membership_place_idx', 'club_code.club_code_code_uq']
    .every((name) => clubIndexNames.has(name)),
)

// شناسهٔ داخلی menu_item با import دوباره عوض می‌شود؛ URL عمومی فقط باید به
// public_id متکی باشد. این کنترل جلوی deploy شدن schema ناقص را می‌گیرد.
const [menuItemColumns] = await conn.query(
  `SELECT COLUMN_NAME, IS_NULLABLE, CHARACTER_MAXIMUM_LENGTH
   FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'menu_item' AND COLUMN_NAME = 'public_id'`,
)
const publicIdColumn = menuItemColumns[0]
check(
  'ستون پایدار menu_item.public_id اجباری است',
  publicIdColumn?.IS_NULLABLE === 'NO' && Number(publicIdColumn?.CHARACTER_MAXIMUM_LENGTH) === 40,
  publicIdColumn ? `${publicIdColumn.IS_NULLABLE}, varchar(${publicIdColumn.CHARACTER_MAXIMUM_LENGTH})` : 'ستون پیدا نشد',
)

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

const [menuItemIndexes] = await conn.query(
  `SELECT INDEX_NAME, NON_UNIQUE, COLUMN_NAME
   FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'menu_item'`,
)
const uniqueIndexes = new Map(
  menuItemIndexes
    .filter((row) => Number(row.NON_UNIQUE) === 0)
    .map((row) => [row.INDEX_NAME, row.COLUMN_NAME]),
)
check('ایندکس یکتای public id', uniqueIndexes.get('menu_item_public_id_uq') === 'public_id')
check('ایندکس یکتای source id', uniqueIndexes.get('menu_item_source_id_uq') === 'source_id')

const [menuLifecycleColumns] = await conn.query(
  `SELECT COLUMN_NAME FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'menu_item'
     AND COLUMN_NAME IN ('archived_at', 'exclude_from_price_stats')`,
)
check('چرخه‌ی عمر آیتم منو', menuLifecycleColumns.some((row) => row.COLUMN_NAME === 'archived_at'))
check('استثنای آیتم از آمار قیمت', menuLifecycleColumns.some((row) => row.COLUMN_NAME === 'exclude_from_price_stats'))
check(
  'ایندکس مدیریت آرشیو منو',
  menuItemIndexes.some((row) => row.INDEX_NAME === 'menu_item_place_archive_idx'),
)
const [placePhotoIndexes] = await conn.query(
  `SELECT DISTINCT INDEX_NAME FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'place_photo'`,
)
check('جلوگیری دیتابیسی از تصویر تکراری گالری', placePhotoIndexes.some((row) => row.INDEX_NAME === 'place_photo_media_uq'))

const [searchColumns] = await conn.query(
  `SELECT COLUMN_NAME FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'search_log'
     AND COLUMN_NAME IN ('requested_scope', 'resolved_entity', 'resolved_intent')`,
)
const searchColumnNames = new Set(searchColumns.map((row) => row.COLUMN_NAME))
check(
  'ستون‌های تشخیص موجودیت جست‌وجو',
  ['requested_scope', 'resolved_entity', 'resolved_intent'].every((name) => searchColumnNames.has(name)),
)
const [searchIndexes] = await conn.query(
  `SELECT DISTINCT INDEX_NAME FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'search_log'`,
)
check(
  'ایندکس zero-result بر اساس موجودیت',
  searchIndexes.some((row) => row.INDEX_NAME === 'search_log_zero_entity_idx'),
)

// ── امنیت نشست و Scope شعبه (Phase 1)
const [userSecurityColumns] = await conn.query(
  `SELECT COLUMN_NAME, COLUMN_TYPE FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'app_user'
     AND COLUMN_NAME IN ('status', 'phone_verified_at')`,
)
const userSecurity = new Map(userSecurityColumns.map((row) => [row.COLUMN_NAME, row.COLUMN_TYPE]))
check('زمان تأیید شماره کاربر', userSecurity.has('phone_verified_at'))
check(
  'وضعیت غیرفعال‌سازی حساب',
  String(userSecurity.get('status') ?? '').includes('deactivated'),
)

const [branchColumns] = await conn.query(
  `SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND ((TABLE_NAME = 'place' AND COLUMN_NAME IN ('brand_id', 'branch_name', 'is_primary_branch'))
       OR (TABLE_NAME = 'menu_section' AND COLUMN_NAME IN ('branch_scope', 'branch_label')))`,
)
const branchColumnNames = new Set(branchColumns.map((row) => `${row.TABLE_NAME}.${row.COLUMN_NAME}`))
check(
  'مدل برند و شعبه کامل است',
  ['place.brand_id', 'place.branch_name', 'place.is_primary_branch', 'menu_section.branch_scope', 'menu_section.branch_label']
    .every((name) => branchColumnNames.has(name)),
)
const [placeRevisionColumns] = await conn.query(
  `SELECT COLUMN_NAME FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'place' AND COLUMN_NAME = 'revision'`,
)
check('شماره‌نسخهٔ تعارض فرم پنل', placeRevisionColumns.length === 1)

const [authSessionIndexes] = await conn.query(
  `SELECT DISTINCT INDEX_NAME FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'auth_session'`,
)
check('ایندکس نشست‌های قابل ابطال', authSessionIndexes.some((row) => row.INDEX_NAME === 'auth_session_user_idx'))

const [foreignKeys] = await conn.query(
  `SELECT CONSTRAINT_NAME FROM information_schema.REFERENTIAL_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE()`,
)
const foreignKeyNames = new Set(foreignKeys.map((row) => row.CONSTRAINT_NAME))
for (const name of [
  'auth_session_user_id_app_user_id_fk',
  'user_place_role_user_id_app_user_id_fk',
  'user_place_role_place_id_place_id_fk',
  'menu_section_place_id_place_id_fk',
  'menu_item_place_id_place_id_fk',
  'menu_item_section_id_menu_section_id_fk',
  'menu_item_variant_item_id_fk',
]) {
  check(`قید یکپارچگی ${name}`, foreignKeyNames.has(name))
}

const [[ramouzScope = {}]] = await conn.query(`
  SELECT
    p.branch_name,
    SUM(ms.branch_scope IN ('shared', 'branch')) AS public_sections,
    SUM(ms.branch_scope = 'other_branch') AS hidden_other_branch_sections
  FROM place p
  LEFT JOIN menu_section ms ON ms.place_id = p.id
  WHERE p.source_id = 38
  GROUP BY p.id, p.branch_name
`)
check(
  'راموز به شعبه قاضی و منوی Scope‌شده متصل است',
  ramouzScope.branch_name === 'قاضی طباطبایی'
    && Number(ramouzScope.public_sections ?? 0) > 0
    && Number(ramouzScope.hidden_other_branch_sections ?? 0) > 0,
  `${ramouzScope.public_sections ?? 0} عمومی · ${ramouzScope.hidden_other_branch_sections ?? 0} شعبه دیگر`,
)

/*
  ── منطقه‌ی زمانی ─────────────────────────────────────────────────────

  چیزی که واقعاً مهم است، منطقه‌ی زمانیِ **نشستی** است که اپ استفاده می‌کند،
  نه تنظیم سراسریِ سرور. `src/db/connection.ts` روی هر اتصالِ تازه‌ی استخر
  `SET time_zone='+00:00'` می‌زند، پس اپ روی سروری با هر منطقه‌ی زمانی درست
  کار می‌کند.

  نسخه‌ی قبلیِ این بررسی فقط `@@time_zone` را می‌دید و روی سرور تولید — که
  `Asia/Tehran` است و عوض‌کردنش کلِ ماشین را تحت تأثیر می‌گذارد (میل‌سرور و
  چند سایت دیگر رویش هستند) — همیشه قرمز می‌ماند. بررسیِ همیشه‌قرمز، بررسیِ
  بی‌فایده است: آدم یاد می‌گیرد نادیده‌اش بگیرد.

  پس حالا هر دو سنجیده می‌شود و **آنچه اپ می‌بیند** تعیین‌کننده است.
*/
const [[tzGlobal]] = await conn.query('SELECT @@global.time_zone AS tz')
await conn.query("SET time_zone = '+00:00'")
const [[tzSession]] = await conn.query(
  'SELECT @@session.time_zone AS tz, NOW() AS now_, UTC_TIMESTAMP() AS utc_',
)
const sessionIsUtc = String(tzSession.now_) === String(tzSession.utc_)
check(
  'نشست دیتابیس روی UTC می‌خواند',
  sessionIsUtc,
  sessionIsUtc
    ? `سراسری ${tzGlobal.tz} است ولی اپ نشست را UTC می‌کند (connection.ts)`
    : 'NOW() با UTC_TIMESTAMP() یکی نیست — تایم‌استمپ‌ها جابه‌جا خوانده می‌شوند',
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
    (SELECT COUNT(*) FROM app_user WHERE role = 'admin' AND status = 'active') AS admins
`)
check('مکان‌ها وارد شده‌اند', counts.places > 300, `${counts.places} مکان`)
check('منو وارد شده', counts.items > 19000, `${counts.items} آیتم`)
check('تصاویر دانلود شده‌اند', counts.media_ok > 14000, `${counts.media_ok} تصویر`)
check('واژگان ساخته شده', counts.facets > 30 && counts.dishes > 90, `${counts.facets} facet · ${counts.dishes} دیش`)
check('رول‌آپ facet پر است', counts.place_facets > 2000, `${counts.place_facets} ردیف`)
check('حداقل یک مدیر وجود دارد', counts.admins > 0, `${counts.admins} مدیر`)

const [[itemIdentity]] = await conn.query(`
  SELECT
    COUNT(*) AS total,
    COUNT(public_id) AS with_public_id,
    COUNT(DISTINCT public_id) AS distinct_public_id,
    COUNT(source_id) AS with_source_id,
    COUNT(DISTINCT source_id) AS distinct_source_id
  FROM menu_item
`)
check(
  'public id همهٔ آیتم‌ها کامل و یکتا است',
  Number(itemIdentity.total) === Number(itemIdentity.with_public_id)
    && Number(itemIdentity.total) === Number(itemIdentity.distinct_public_id),
  `${itemIdentity.distinct_public_id}/${itemIdentity.total}`,
)
check(
  'source idهای import شده تکراری نیستند',
  Number(itemIdentity.with_source_id) === Number(itemIdentity.distinct_source_id),
  `${itemIdentity.distinct_source_id}/${itemIdentity.with_source_id}`,
)

await conn.end()
console.log(failures === 0 ? '\nساختار دیتابیس سالم است.' : `\n${failures} مشکل پیدا شد.`)
process.exit(failures === 0 ? 0 : 1)
