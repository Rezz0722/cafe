/**
 * شمای MySQL 8.4 — منبعِ حقیقتِ ساختار دیتابیس.
 *
 * ═══ چرا MySQL و نه Postgres ═══
 *
 * نسخه‌ی قبلی این فایل شمای Postgres با PostGIS بود. الزام پروژه MySQL است،
 * پس کل شما بازنویسی شد. تفاوت‌هایی که روی طراحی اثر گذاشتند در
 * `task/01-data-audit/DESIGN.md` بخش ۲ فهرست شده‌اند؛ خلاصه:
 *
 *   • UUID خودکار نداریم → شناسه‌ها یا `AUTO_INCREMENT`اند یا UUID تولیدشده
 *     در اپ. فقط `app_user` شناسه‌ی UUID دارد چون در کوکی نشست ظاهر می‌شود و
 *     نباید تعداد کاربران را لو بدهد.
 *   • PostGIS نداریم → `lat`/`lng` به‌صورت `DECIMAL(10,7)` با ایندکس. برای
 *     ۳۳۱ مکان، فیلتر کادر + هاورساین در اپ از هر ایندکس فضایی سریع‌تر
 *     راه می‌افتد و یک وابستگی کمتر دارد.
 *   • `utf8mb4` اجباری است، نه سلیقه: نام آیتم‌های واقعی ایموجی دارند
 *     («وسترن🌶️») و `utf8` سه‌بایتی MySQL آن‌ها را می‌شکند.
 *
 * ═══ قرارداد ═══
 *
 *   • همه‌ی `timestamp`ها UTC ذخیره می‌شوند؛ تبدیل به وقت تهران کارِ UI است.
 *   • `dow` صفر = شنبه (هفته‌ی ایرانی).
 *   • پول همیشه **تومان** و `INT` است، نه اعشاری. قیمت نامعلوم `NULL` است
 *     نه صفر — چون صفر یک قیمتِ معتبر است و «قیمت روز» نیست.
 */

import { relations } from 'drizzle-orm'
import {
  bigint,
  boolean,
  char,
  date,
  decimal,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  primaryKey,
  text,
  time,
  timestamp,
  tinyint,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core'

// ── شمارشی‌های مشترک ─────────────────────────────────────────────────

export const PLACE_STATUS = [
  'draft',
  'published',
  'temporarily_closed',
  'permanently_closed',
  'merged',
] as const

/**
 * `shop` عمداً اینجاست: فایل منبع خروجی یک پلتفرم منوی عمومی است و داخلش
 * کاکتوس‌فروشی، عطرفروشی و عمده‌فروشی تخم‌مرغ هم هست. این‌ها حذف نمی‌شوند
 * (ممکن است داده‌شان بعداً لازم شود) ولی به‌عنوان کافه منتشر نمی‌شوند.
 */
export const PLACE_KIND = [
  'cafe',
  'cafe_restaurant',
  'restaurant',
  'bakery',
  'lounge',
  'shop',
] as const

export const DATA_SOURCE = [
  'import', // فایل منبع topmenumarket
  'field_visit', // بازدید میدانی — بالاترین اعتماد
  'owner', // خودِ کافه‌دار
  'user', // پیشنهاد کاربر
  'instagram',
  'inferred', // محاسبه‌شده از بقیه‌ی داده
] as const

// `editorial` فقط منبعِ قضاوت Attribute است، نه منبع واردکردن خود مکان یا
// منو. انتهای ENUM آمده تا MariaDB آن را بدون rebuild جدول اضافه کند.
export const ATTRIBUTE_DATA_SOURCE = [...DATA_SOURCE, 'editorial'] as const

/**
 * وضعیت مختصات. بدون این، یک ژئوکدِ خراب سورت «نزدیک‌ترین» را برای همه خراب
 * می‌کند — در داده‌ی واقعی ۱۵ مکان بیرون کادر مشهد بودند و ۷۳ مکان بی‌مختصات.
 */
export const GEO_STATUS = ['ok', 'out_of_area', 'missing'] as const

// ═══════════════════════════════════════════════════════════════════════
// واژگان و مراجع
// ═══════════════════════════════════════════════════════════════════════

export const district = mysqlTable('district', {
  id: varchar('id', { length: 48 }).primaryKey(),
  slug: varchar('slug', { length: 64 }).notNull(),
  name: varchar('name', { length: 120 }).notNull(),
  centerLat: decimal('center_lat', { precision: 10, scale: 7 }).notNull(),
  centerLng: decimal('center_lng', { precision: 10, scale: 7 }).notNull(),
  /** شعاع تقریبی محله به متر — برای انتساب مکان به محله از مختصات. */
  radiusM: int('radius_m').notNull().default(1200),
  sortOrder: int('sort_order').notNull().default(0),
})

/**
 * facet = چیزی که کاربر با آن **فیلتر** می‌کند.
 *
 * از `attribute` جداست چون منشأشان فرق دارد: facet از منوی واقعی استخراج
 * می‌شود (قابل اثبات: «۱۲ آیتم پاستا دارد»)، ولی attribute قضاوت است
 * («دنج است»). قاطی‌کردنشان یعنی فیلترِ اثبات‌پذیر و فیلترِ سلیقه‌ای یک
 * اعتبار داشته باشند، که ندارند.
 */
export const facet = mysqlTable(
  'facet',
  {
    id: varchar('id', { length: 48 }).primaryKey(),
    slug: varchar('slug', { length: 64 }).notNull(),
    labelFa: varchar('label_fa', { length: 120 }).notNull(),
    labelEn: varchar('label_en', { length: 120 }),
    kind: mysqlEnum('kind', ['menu', 'cuisine', 'drink', 'service']).notNull(),
    isFilter: boolean('is_filter').notNull().default(true),
    /** روی نوار فیلترهای پرمصرف صفحه‌ی اول بیاید؟ از تحلیل داده پر می‌شود. */
    isPopular: boolean('is_popular').notNull().default(false),
    sortOrder: int('sort_order').notNull().default(0),
    icon: varchar('icon', { length: 32 }),
    hint: varchar('hint', { length: 255 }),
    /** تعداد مکان‌هایی که این facet را دارند — کش برای نمایش «(۴۲)». */
    placeCount: int('place_count').notNull().default(0),
  },
  (t) => [uniqueIndex('facet_slug_uq').on(t.slug), index('facet_popular_idx').on(t.isPopular)],
)

export const attribute = mysqlTable('attribute', {
  id: varchar('id', { length: 48 }).primaryKey(),
  labelFa: varchar('label_fa', { length: 120 }).notNull(),
  kind: mysqlEnum('kind', ['intent', 'amenity', 'vibe']).notNull(),
  isFilter: boolean('is_filter').notNull().default(false),
  sortOrder: int('sort_order').notNull().default(0),
  hint: varchar('hint', { length: 255 }),
})

/**
 * کاتالوگ غذا/نوشیدنیِ نرمال‌شده.
 *
 * این جدول همان چیزی است که «بهترین پاستا نزدیک من» را ممکن می‌کند: ۱۱٬۳۶۱
 * نام آیتم یکتای فایل منبع به چند صد دیشِ کانونی نگاشت می‌شوند، پس می‌شود
 * روی `dish_id` شرط گذاشت و با فاصله و امتیاز مرتب کرد. جست‌وجوی متنی روی
 * نام آیتم این کار را نمی‌کند، چون «آیس لاته نارگیل» و «لاته» را یکی
 * نمی‌بیند و «کیک لاته‌ای» را اشتباهی می‌گیرد.
 */
export const dish = mysqlTable(
  'dish',
  {
    id: int('id').autoincrement().primaryKey(),
    slug: varchar('slug', { length: 64 }).notNull(),
    nameFa: varchar('name_fa', { length: 120 }).notNull(),
    nameEn: varchar('name_en', { length: 120 }),
    facetId: varchar('facet_id', { length: 48 }).references(() => facet.id),
    /** «بهترین X نزدیک من» برای این دیش پیشنهاد شود؟ */
    isPopular: boolean('is_popular').notNull().default(false),
    sortOrder: int('sort_order').notNull().default(0),
    // آمار محاسبه‌شده — برای رتبه‌بندی و نمایش بدون join سنگین
    placeCount: int('place_count').notNull().default(0),
    itemCount: int('item_count').notNull().default(0),
    minPrice: int('min_price'),
    medianPrice: int('median_price'),
  },
  (t) => [
    uniqueIndex('dish_slug_uq').on(t.slug),
    index('dish_facet_idx').on(t.facetId),
    index('dish_popular_idx').on(t.isPopular),
  ],
)

/** مترادف‌های دیش — ورودی تطبیق نام آیتم به دیش کانونی. */
export const dishAlias = mysqlTable(
  'dish_alias',
  {
    alias: varchar('alias', { length: 120 }).primaryKey(),
    dishId: int('dish_id')
      .notNull()
      .references(() => dish.id, { onDelete: 'cascade' }),
  },
  (t) => [index('dish_alias_dish_idx').on(t.dishId)],
)

// ═══════════════════════════════════════════════════════════════════════
// رسانه — رجیستری تصاویر لوکال
// ═══════════════════════════════════════════════════════════════════════

/**
 * هر تصویر یک ردیف. فایل منبع ۱۴٬۵۵۸ آدرس CDN دارد و همه باید لوکال شوند.
 *
 * `url_hash` کلید یکتاست نه خود URL، چون URLهای CDN بلندند و ایندکس یکتای
 * MySQL روی VARCHAR بلند به سقف ۳۰۷۲ بایتی می‌خورد.
 *
 * `status` و `attempts` دانلود را **قابل ازسرگیری** می‌کنند: ۱۴هزار دانلود
 * قطع می‌شود، و بدون این دو ستون هر بار باید از صفر شروع کرد.
 */
export const media = mysqlTable(
  'media',
  {
    id: int('id').autoincrement().primaryKey(),
    urlHash: char('url_hash', { length: 40 }).notNull(),
    sourceUrl: varchar('source_url', { length: 700 }).notNull(),
    /** مسیر نسبی زیر `public/` — مثلاً `media/item/8f/8f3a….webp` */
    localPath: varchar('local_path', { length: 300 }),
    kind: mysqlEnum('kind', [
      'logo',
      'menu_item',
      'menu_section',
      'place_photo',
      'avatar',
      'upload',
    ]).notNull(),
    format: varchar('format', { length: 8 }),
    width: int('width'),
    height: int('height'),
    bytes: int('bytes'),
    /** SHA-256 محتوا — تصاویر یکسان با URL متفاوت یک فایل می‌شوند. */
    contentHash: char('content_hash', { length: 64 }),
    status: mysqlEnum('status', ['pending', 'ok', 'failed', 'skipped'])
      .notNull()
      .default('pending'),
    attempts: tinyint('attempts').notNull().default(0),
    error: varchar('error', { length: 255 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    fetchedAt: timestamp('fetched_at'),
  },
  (t) => [
    uniqueIndex('media_url_hash_uq').on(t.urlHash),
    index('media_status_idx').on(t.status),
    index('media_content_hash_idx').on(t.contentHash),
  ],
)

// ═══════════════════════════════════════════════════════════════════════
// مکان
// ═══════════════════════════════════════════════════════════════════════

/** هویت مجموعهٔ مادر؛ اطلاعات عملیاتی همیشه روی شعبه (`place`) است. */
export const placeBrand = mysqlTable(
  'place_brand',
  {
    id: int('id').autoincrement().primaryKey(),
    slug: varchar('slug', { length: 140 }).notNull(),
    name: varchar('name', { length: 200 }).notNull(),
    nameEn: varchar('name_en', { length: 200 }),
    status: mysqlEnum('status', ['active', 'inactive']).notNull().default('active'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
  },
  (t) => [uniqueIndex('place_brand_slug_uq').on(t.slug)],
)

export const place = mysqlTable(
  'place',
  {
    id: int('id').autoincrement().primaryKey(),
    slug: varchar('slug', { length: 140 }).notNull(),

    /** `شناسه` در فایل منبع — برای ایمپورت idempotent. */
    sourceId: int('source_id'),
    /** `یوزرنیم` منبع — پایه‌ی slug، چون ۱۰۰٪ یکتاست و نام‌ها نیستند. */
    sourceUsername: varchar('source_username', { length: 140 }),

    /** برند/مجموعهٔ مادر؛ خودِ هر ردیف place یک شعبهٔ مستقل است. */
    brandId: int('brand_id').references(() => placeBrand.id, { onDelete: 'set null' }),
    /** نام کوتاه شعبه، بدون تکرار نام برند؛ مثل «قاضی طباطبایی». */
    branchName: varchar('branch_name', { length: 160 }),
    isPrimaryBranch: boolean('is_primary_branch').notNull().default(false),

    name: varchar('name', { length: 200 }).notNull(),
    nameEn: varchar('name_en', { length: 200 }),
    /** بی‌اعراب، بی‌فاصله‌ی مجازی، ارقام ASCII — کلید جست‌وجو و dedupe. */
    nameNormalized: varchar('name_normalized', { length: 200 }).notNull(),

    kind: mysqlEnum('kind', PLACE_KIND).notNull().default('cafe'),
    status: mysqlEnum('status', PLACE_STATUS).notNull().default('draft'),
    mergedInto: int('merged_into'),

    lat: decimal('lat', { precision: 10, scale: 7 }),
    lng: decimal('lng', { precision: 10, scale: 7 }),
    geoStatus: mysqlEnum('geo_status', GEO_STATUS).notNull().default('missing'),

    address: varchar('address', { length: 500 }).notNull().default(''),
    districtId: varchar('district_id', { length: 48 }).references(() => district.id),

    /** ۱ ارزان · ۲ متوسط · ۳ گران — از میانه‌ی قیمت منو مشتق می‌شود. */
    priceTier: tinyint('price_tier').notNull().default(2),
    priceMin: int('price_min'),
    priceMedian: int('price_median'),
    priceMax: int('price_max'),
    /**
     * قیمت‌های این کافه در منبع به «هزار تومان» بودند و ×۱۰۰۰ شدند.
     * ۲۳ کافه در داده‌ی واقعی. پرچم می‌ماند تا ادمین بتواند بازبینی کند.
     */
    priceUnitFixed: boolean('price_unit_fixed').notNull().default(false),

    menuUrl: varchar('menu_url', { length: 500 }),
    instagram: varchar('instagram', { length: 120 }),
    about: text('about'),
    logoMediaId: int('logo_media_id').references(() => media.id),
    coverMediaId: int('cover_media_id').references(() => media.id),

    /** میانگین از sum/count با میانگین بیزی مشتق می‌شود، ذخیره نمی‌شود. */
    ratingSum: int('rating_sum').notNull().default(0),
    ratingCount: int('rating_count').notNull().default(0),

    /** برچسب تحریریه‌ای — «منتخب سردبیر». */
    ribbon: varchar('ribbon', { length: 80 }),
    /** آیتم شاخص منو برای نمایش در کارت. */
    signatureItem: varchar('signature_item', { length: 200 }),

    /** ۰..۱۰۰ کامل‌بودن پروفایل — کش‌شده تا سورت کیفیت join نخواهد. */
    qualityScore: tinyint('quality_score').notNull().default(0),
    viewCount: int('view_count').notNull().default(0),

    source: mysqlEnum('source', DATA_SOURCE).notNull().default('import'),
    lastVerifiedAt: timestamp('last_verified_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
    /** نسخهٔ افزایشی فرم‌های مدیریت برای جلوگیری از overwrite هم‌زمان. */
    revision: int('revision').notNull().default(0),
    createdByUserId: char('created_by_user_id', { length: 36 }),
  },
  (t) => [
    uniqueIndex('place_slug_uq').on(t.slug),
    uniqueIndex('place_source_uq').on(t.sourceId),
    index('place_status_idx').on(t.status),
    index('place_brand_idx').on(t.brandId, t.status),
    index('place_district_idx').on(t.districtId),
    index('place_geo_idx').on(t.geoStatus, t.lat, t.lng),
    index('place_price_idx').on(t.priceTier),
    index('place_name_norm_idx').on(t.nameNormalized),
  ],
)

/**
 * ایندکس‌هایی که drizzle-kit تولید نمی‌کند — در `drizzle/mysql-extras.sql`:
 *
 *   ALTER TABLE place ADD FULLTEXT INDEX place_name_ft (name, name_normalized);
 *   ALTER TABLE menu_item ADD FULLTEXT INDEX menu_item_name_ft (name, name_normalized);
 *
 * اولی جست‌وجوی نام کافه، دومی جست‌وجوی آزاد در منو («کجا کروسان داره»).
 */

/** ۹۲ مکان چند شماره دارند، پس شماره ستون نیست — جدول است. */
export const placePhone = mysqlTable(
  'place_phone',
  {
    placeId: int('place_id')
      .notNull()
      .references(() => place.id, { onDelete: 'cascade' }),
    phone: varchar('phone', { length: 20 }).notNull(),
    kind: mysqlEnum('kind', ['mobile', 'landline', 'reservation', 'other'])
      .notNull()
      .default('other'),
    sortOrder: tinyint('sort_order').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.placeId, t.phone] })],
)

export const placeSocial = mysqlTable(
  'place_social',
  {
    id: int('id').autoincrement().primaryKey(),
    placeId: int('place_id')
      .notNull()
      .references(() => place.id, { onDelete: 'cascade' }),
    kind: mysqlEnum('kind', [
      'instagram',
      'telegram',
      'whatsapp',
      'website',
      'reservation',
      'virtual_tour',
      'survey',
      'rubika',
      'eitaa',
      'bale',
      'other',
    ]).notNull(),
    label: varchar('label', { length: 80 }),
    url: varchar('url', { length: 500 }).notNull(),
    handle: varchar('handle', { length: 120 }),
  },
  (t) => [index('place_social_place_idx').on(t.placeId)],
)

/**
 * ساعت کاری با **شیفت**.
 *
 * کلید سه‌ستونی است چون داده‌ی واقعی شیفت شکسته دارد:
 * `شنبه: 12:00-16:30 و 20:00-23:30`. شمای قبلی (کلید دوستونی) این را
 * نمی‌توانست ذخیره کند و ساعت ظهرِ رستوران‌ها را دور می‌ریخت.
 */
export const placeHours = mysqlTable(
  'place_hours',
  {
    placeId: int('place_id')
      .notNull()
      .references(() => place.id, { onDelete: 'cascade' }),
    /** ۰ = شنبه */
    dow: tinyint('dow').notNull(),
    shiftIndex: tinyint('shift_index').notNull().default(0),
    opensAt: time('opens_at'),
    closesAt: time('closes_at'),
    /** بستن بعد از نیمه‌شب — `20:00-01:30` یا `08:00-24:00` منبع. */
    crossesMidnight: boolean('crosses_midnight').notNull().default(false),
    closed: boolean('closed').notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.placeId, t.dow, t.shiftIndex] })],
)

/** تعطیلات رسمی و ساعت رمضان — بدون این، «باز است» در نوروز دروغ می‌گوید. */
export const placeHoursException = mysqlTable(
  'place_hours_exception',
  {
    id: int('id').autoincrement().primaryKey(),
    placeId: int('place_id')
      .notNull()
      .references(() => place.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    closed: boolean('closed').notNull().default(true),
    opensAt: time('opens_at'),
    closesAt: time('closes_at'),
    reason: varchar('reason', { length: 160 }),
  },
  (t) => [index('place_hours_exc_idx').on(t.placeId, t.date)],
)

export const placeAttribute = mysqlTable(
  'place_attribute',
  {
    placeId: int('place_id')
      .notNull()
      .references(() => place.id, { onDelete: 'cascade' }),
    attributeId: varchar('attribute_id', { length: 48 })
      .notNull()
      .references(() => attribute.id),
    /** ۰ نه · ۱ تاحدی · ۲ بله — عمداً boolean نیست. */
    value: tinyint('value').notNull(),
    confidence: tinyint('confidence').notNull().default(50),
    source: mysqlEnum('source', ATTRIBUTE_DATA_SOURCE).notNull().default('inferred'),
    verifiedAt: timestamp('verified_at'),
  },
  (t) => [
    primaryKey({ columns: [t.placeId, t.attributeId] }),
    // صفحه‌های Experience از attribute به مکان می‌رسند؛ کلید اصلی مسیر عکس
    // این پرس‌وجو را پوشش نمی‌دهد چون با place_id شروع می‌شود.
    index('place_attribute_discovery_idx').on(t.attributeId, t.value, t.placeId),
  ],
)

/** رول‌آپ facet در سطح مکان — تا فیلتر کردن به join با ۱۹هزار آیتم نیفتد. */
export const placeFacet = mysqlTable(
  'place_facet',
  {
    placeId: int('place_id')
      .notNull()
      .references(() => place.id, { onDelete: 'cascade' }),
    facetId: varchar('facet_id', { length: 48 })
      .notNull()
      .references(() => facet.id),
    itemCount: int('item_count').notNull().default(0),
    minPrice: int('min_price'),
    medianPrice: int('median_price'),
    confidence: tinyint('confidence').notNull().default(80),
  },
  (t) => [
    primaryKey({ columns: [t.placeId, t.facetId] }),
    index('place_facet_facet_idx').on(t.facetId),
  ],
)

/** رول‌آپ دیش در سطح مکان — قلب «بهترین پاستا نزدیک من». */
export const placeDish = mysqlTable(
  'place_dish',
  {
    placeId: int('place_id')
      .notNull()
      .references(() => place.id, { onDelete: 'cascade' }),
    dishId: int('dish_id')
      .notNull()
      .references(() => dish.id, { onDelete: 'cascade' }),
    itemCount: int('item_count').notNull().default(0),
    minPrice: int('min_price'),
    /** ارزان‌ترین/شاخص‌ترین آیتم این دیش در این مکان — برای نمایش کارت. */
    bestItemId: int('best_item_id'),
  },
  (t) => [
    primaryKey({ columns: [t.placeId, t.dishId] }),
    index('place_dish_dish_idx').on(t.dishId),
  ],
)

export const placePhoto = mysqlTable(
  'place_photo',
  {
    id: int('id').autoincrement().primaryKey(),
    placeId: int('place_id')
      .notNull()
      .references(() => place.id, { onDelete: 'cascade' }),
    mediaId: int('media_id')
      .notNull()
      .references(() => media.id),
    alt: varchar('alt', { length: 255 }).notNull().default(''),
    sortOrder: int('sort_order').notNull().default(0),
    source: mysqlEnum('source', DATA_SOURCE).notNull().default('import'),
    uploadedByUserId: char('uploaded_by_user_id', { length: 36 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('place_photo_place_idx').on(t.placeId, t.sortOrder),
    uniqueIndex('place_photo_media_uq').on(t.placeId, t.mediaId),
  ],
)

// ═══════════════════════════════════════════════════════════════════════
// منو
// ═══════════════════════════════════════════════════════════════════════

export const menuSection = mysqlTable(
  'menu_section',
  {
    id: int('id').autoincrement().primaryKey(),
    placeId: int('place_id')
      .notNull()
      .references(() => place.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 200 }).notNull(),
    nameEn: varchar('name_en', { length: 200 }),
    description: text('description'),
    mediaId: int('media_id').references(() => media.id),
    /** facet کانونیِ استخراج‌شده از نام دسته — ۱٬۹۴۵ نام یکتا → ~۴۰ facet. */
    facetId: varchar('facet_id', { length: 48 }).references(() => facet.id),
    /**
     * منبع‌هایی مثل راموز یک منوی چندشعبه‌ای پس می‌دهند. دستهٔ متعلق به
     * شعبهٔ دیگر حفظ می‌شود اما تا تعیین مالک واقعی در صفحهٔ این شعبه منتشر
     * نمی‌شود.
     */
    branchScope: mysqlEnum('branch_scope', ['shared', 'branch', 'other_branch', 'unverified'])
      .notNull()
      .default('shared'),
    branchLabel: varchar('branch_label', { length: 200 }),
    sortOrder: int('sort_order').notNull().default(0),
  },
  (t) => [
    index('menu_section_place_idx').on(t.placeId, t.sortOrder),
    index('menu_section_scope_idx').on(t.placeId, t.branchScope, t.sortOrder),
  ],
)

export const menuItem = mysqlTable(
  'menu_item',
  {
    id: int('id').autoincrement().primaryKey(),
    /** هویت عمومی پایدار؛ برخلاف id داخلی پس از import عوض نمی‌شود. */
    publicId: varchar('public_id', { length: 40 }).notNull(),
    /** عمداً denormalize شده: هر پرس‌وجوی «آیتم‌های این کافه» یک join کمتر. */
    placeId: int('place_id')
      .notNull()
      .references(() => place.id, { onDelete: 'cascade' }),
    sectionId: int('section_id')
      .notNull()
      .references(() => menuSection.id, { onDelete: 'cascade' }),
    sourceId: int('source_id'),
    name: varchar('name', { length: 250 }).notNull(),
    nameEn: varchar('name_en', { length: 250 }),
    nameNormalized: varchar('name_normalized', { length: 250 }).notNull(),
    description: text('description'),
    /** تومان. `NULL` = قیمت نامعلوم؛ صفر یک قیمتِ معتبر است، پس صفر نیست. */
    price: int('price'),
    priceUnknown: boolean('price_unknown').notNull().default(false),
    /** آیتم‌هایی مثل فروش تجهیزات/خدمات که نباید سطح قیمت خوراکی‌های مکان را منحرف کنند. */
    excludeFromPriceStats: boolean('exclude_from_price_stats').notNull().default(false),
    available: boolean('available').notNull().default(true),
    featured: boolean('featured').notNull().default(false),
    mediaId: int('media_id').references(() => media.id),
    dishId: int('dish_id').references(() => dish.id),
    sortOrder: int('sort_order').notNull().default(0),
    /** آرشیو با «ناموجود» فرق دارد: ناموجود موقتی است، آرشیو از سایت پنهان می‌شود. */
    archivedAt: timestamp('archived_at'),
    priceUpdatedAt: timestamp('price_updated_at'),
  },
  (t) => [
    uniqueIndex('menu_item_public_id_uq').on(t.publicId),
    uniqueIndex('menu_item_source_id_uq').on(t.sourceId),
    index('menu_item_section_idx').on(t.sectionId, t.sortOrder),
    index('menu_item_place_idx').on(t.placeId),
    index('menu_item_place_archive_idx').on(t.placeId, t.archivedAt, t.sectionId, t.sortOrder),
    index('menu_item_dish_idx').on(t.dishId),
    index('menu_item_price_idx').on(t.price),
  ],
)

/**
 * تنوع‌های قابل سفارش یک آیتم؛ مثل «کوچک/بزرگ» یا «تک‌نفره/دونفره».
 * قیمت پایهٔ menu_item برای آیتم دارای تنوع، کمترین قیمت تنوع‌های موجود است
 * تا جست‌وجو و مرتب‌سازی قیمت همچنان یک مقدار قابل توضیح داشته باشند.
 */
export const menuItemVariant = mysqlTable(
  'menu_item_variant',
  {
    id: int('id').autoincrement().primaryKey(),
    itemId: int('item_id')
      .notNull()
      .references(() => menuItem.id, { onDelete: 'cascade' }),
    label: varchar('label', { length: 120 }).notNull(),
    price: int('price'),
    available: boolean('available').notNull().default(true),
    sortOrder: int('sort_order').notNull().default(0),
    priceUpdatedAt: timestamp('price_updated_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
  },
  (t) => [
    uniqueIndex('menu_item_variant_label_uq').on(t.itemId, t.label),
    index('menu_item_variant_item_idx').on(t.itemId, t.sortOrder),
  ],
)

// ═══════════════════════════════════════════════════════════════════════
// کاربر
// ═══════════════════════════════════════════════════════════════════════

/**
 * `phone` و `username` هر دو اختیاری و یکتا هستند، ولی حداقل یکی لازم است.
 *
 * دلیل: دو مسیر ورود موازی داریم. کاربر عادی با شماره و کد پیامکی می‌آید؛
 * پنل کافه اعتبارنامه‌ای می‌گیرد که **ادمین** ساخته و ممکن است شماره نداشته
 * باشد. اجباری‌کردن شماره یعنی ادمین برای هر کافه یک شماره‌ی جعلی بسازد.
 */
export const appUser = mysqlTable(
  'app_user',
  {
    id: char('id', { length: 36 }).primaryKey(),
    phone: varchar('phone', { length: 16 }),
    username: varchar('username', { length: 64 }),
    email: varchar('email', { length: 160 }),
    name: varchar('name', { length: 120 }).notNull().default(''),
    role: mysqlEnum('role', ['customer', 'owner', 'admin']).notNull().default('customer'),
    status: mysqlEnum('status', ['active', 'blocked', 'deactivated']).notNull().default('active'),
    /** شماره فقط پس از مصرف OTP مخصوص verify_phone تأییدشده محسوب می‌شود. */
    phoneVerifiedAt: timestamp('phone_verified_at'),

    /** scrypt. `NULL` = این حساب فقط با کد پیامکی وارد می‌شود. */
    passwordHash: varchar('password_hash', { length: 255 }),
    passwordUpdatedAt: timestamp('password_updated_at'),
    /** ادمین رمز موقت داده — کاربر باید در ورود بعدی عوضش کند. */
    mustChangePassword: boolean('must_change_password').notNull().default(false),

    avatarMediaId: int('avatar_media_id').references(() => media.id),
    /** آخرین موقعیت تأییدشده‌ی کاربر — برای «نزدیک من» بدون پرسیدن دوباره. */
    lastLat: decimal('last_lat', { precision: 10, scale: 7 }),
    lastLng: decimal('last_lng', { precision: 10, scale: 7 }),

    failedLogins: tinyint('failed_logins').notNull().default(0),
    lockedUntil: timestamp('locked_until'),

    createdAt: timestamp('created_at').notNull().defaultNow(),
    lastLoginAt: timestamp('last_login_at'),
    /** ادمینی که این حساب را ساخته — برای اعتبارنامه‌های صادرشده از پنل. */
    createdByUserId: char('created_by_user_id', { length: 36 }),
  },
  (t) => [
    uniqueIndex('app_user_phone_uq').on(t.phone),
    uniqueIndex('app_user_username_uq').on(t.username),
    index('app_user_role_idx').on(t.role),
  ],
)

/** چه کسی کدام کافه را اداره می‌کند. */
export const userPlaceRole = mysqlTable(
  'user_place_role',
  {
    userId: char('user_id', { length: 36 })
      .notNull()
      .references(() => appUser.id, { onDelete: 'cascade' }),
    placeId: int('place_id')
      .notNull()
      .references(() => place.id, { onDelete: 'cascade' }),
    role: mysqlEnum('role', ['owner', 'manager', 'staff']).notNull().default('owner'),
    status: mysqlEnum('status', ['active', 'pending', 'revoked']).notNull().default('active'),
    grantedByUserId: char('granted_by_user_id', { length: 36 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.placeId] }),
    index('user_place_role_place_idx').on(t.placeId),
  ],
)

/** دسترسی تحریریه مستقل از نقش مدیریتی؛ یک مالک نیز می‌تواند بلاگر باشد. */
export const bloggerProfile = mysqlTable('blogger_profile', {
  userId: char('user_id', { length: 36 }).primaryKey().references(() => appUser.id, { onDelete: 'cascade' }),
  instagramHandle: varchar('instagram_handle', { length: 64 }),
  bio: varchar('bio', { length: 300 }),
  active: boolean('active').notNull().default(true),
  verifiedByUserId: char('verified_by_user_id', { length: 36 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
})

/**
 * پروفایل سلیقه — خروجی سلیقه‌سنجی چندسؤالی.
 *
 * `answers` به‌صورت JSON خام هم نگه داشته می‌شود، نه فقط وزن‌های استخراج‌شده:
 * وقتی فردا الگوریتم پیشنهاد عوض شد، بدون پرسیدن دوباره از کاربر می‌شود
 * وزن‌ها را از نو حساب کرد.
 */
export const userTasteProfile = mysqlTable('user_taste_profile', {
  userId: char('user_id', { length: 36 })
    .primaryKey()
    .references(() => appUser.id, { onDelete: 'cascade' }),
  /** ۱ ارزان · ۲ متوسط · ۳ گران — سقف بودجه‌ی معمول کاربر. */
  budgetBand: tinyint('budget_band'),
  answers: json('answers'),
  version: tinyint('version').notNull().default(1),
  completedAt: timestamp('completed_at'),
  updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
})

/** وزن سلیقه روی یک facet/dish/attribute/محله. `-2..+2` */
export const userPreference = mysqlTable(
  'user_preference',
  {
    userId: char('user_id', { length: 36 })
      .notNull()
      .references(() => appUser.id, { onDelete: 'cascade' }),
    kind: mysqlEnum('kind', ['facet', 'dish', 'attribute', 'district']).notNull(),
    refId: varchar('ref_id', { length: 64 }).notNull(),
    weight: tinyint('weight').notNull().default(1),
    source: mysqlEnum('source', ['quiz', 'behavior', 'explicit']).notNull().default('quiz'),
    updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.kind, t.refId] })],
)

export const savedPlace = mysqlTable(
  'saved_place',
  {
    userId: char('user_id', { length: 36 })
      .notNull()
      .references(() => appUser.id, { onDelete: 'cascade' }),
    placeId: int('place_id')
      .notNull()
      .references(() => place.id, { onDelete: 'cascade' }),
    note: varchar('note', { length: 255 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.placeId] }),
    index('saved_place_place_idx').on(t.placeId),
  ],
)

/** عضویت بازاریابی با رضایت صریح؛ مستقل از «ذخیره‌کردن» شخصی کافه. */
export const clubMembership = mysqlTable('club_membership', {
  userId: char('user_id', { length: 36 }).notNull().references(() => appUser.id, { onDelete: 'cascade' }),
  placeId: int('place_id').notNull().references(() => place.id, { onDelete: 'cascade' }),
  status: mysqlEnum('status', ['active', 'left', 'blocked']).notNull().default('active'),
  consentAt: timestamp('consent_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.placeId] }), index('club_membership_place_idx').on(t.placeId, t.status)])

export const clubOffer = mysqlTable('club_offer', {
  id: int('id').autoincrement().primaryKey(),
  placeId: int('place_id').notNull().references(() => place.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 120 }).notNull(),
  description: varchar('description', { length: 500 }),
  discountLabel: varchar('discount_label', { length: 80 }).notNull(),
  active: boolean('active').notNull().default(true),
  expiresAt: timestamp('expires_at'),
  createdByUserId: char('created_by_user_id', { length: 36 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [index('club_offer_place_idx').on(t.placeId, t.active)])

export const clubCode = mysqlTable('club_code', {
  id: int('id').autoincrement().primaryKey(),
  offerId: int('offer_id').notNull().references(() => clubOffer.id, { onDelete: 'cascade' }),
  userId: char('user_id', { length: 36 }).notNull().references(() => appUser.id, { onDelete: 'cascade' }),
  code: varchar('code', { length: 16 }).notNull(),
  status: mysqlEnum('status', ['issued', 'redeemed', 'cancelled', 'expired']).notNull().default('issued'),
  issuedAt: timestamp('issued_at').notNull().defaultNow(),
  redeemedAt: timestamp('redeemed_at'),
  redeemedByUserId: char('redeemed_by_user_id', { length: 36 }),
}, (t) => [uniqueIndex('club_code_code_uq').on(t.code), index('club_code_user_idx').on(t.userId, t.status)])

/** کمپین عمومی روی قیمت پایه منوی همان شعبه؛ مستقل از کد باشگاه. */
export const venueDiscount = mysqlTable('venue_discount', {
  placeId:int('place_id').primaryKey().references(()=>place.id,{onDelete:'cascade'}),
  percent:int('percent').notNull(),
  expiresAt:timestamp('expires_at').notNull(),
  active:boolean('active').notNull().default(true),
  createdByUserId:char('created_by_user_id',{length:36}),
  updatedAt:timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
},t=>[index('venue_discount_active_expiry_idx').on(t.active,t.expiresAt)])

/** نشست فعال — تا ادمین بتواند ورودها را ببیند و نشست را باطل کند. */
export const authSession = mysqlTable(
  'auth_session',
  {
    id: char('id', { length: 36 }).primaryKey(),
    userId: char('user_id', { length: 36 })
      .notNull()
      .references(() => appUser.id, { onDelete: 'cascade' }),
    method: mysqlEnum('method', ['otp', 'password', 'impersonation']).notNull(),
    ip: varchar('ip', { length: 64 }),
    userAgent: varchar('user_agent', { length: 255 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    expiresAt: timestamp('expires_at').notNull(),
    revokedAt: timestamp('revoked_at'),
  },
  (t) => [index('auth_session_user_idx').on(t.userId)],
)

export const otpCode = mysqlTable(
  'otp_code',
  {
    id: int('id').autoincrement().primaryKey(),
    phone: varchar('phone', { length: 16 }).notNull(),
    codeHash: varchar('code_hash', { length: 255 }).notNull(),
    purpose: mysqlEnum('purpose', ['login', 'verify_phone', 'reset_password'])
      .notNull()
      .default('login'),
    attempts: tinyint('attempts').notNull().default(0),
    expiresAt: timestamp('expires_at').notNull(),
    consumedAt: timestamp('consumed_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [index('otp_phone_idx').on(t.phone, t.createdAt)],
)

// ═══════════════════════════════════════════════════════════════════════
// مشارکت کاربران
// ═══════════════════════════════════════════════════════════════════════

/**
 * نظر با امتیازهای تفکیکی.
 *
 * یک ستاره‌ی کلی برای دایرکتوری کافه کافی نیست: کسی که برای کار می‌آید به
 * «آرامش» اهمیت می‌دهد و کسی که برای صبحانه می‌آید به «غذا». امتیاز تفکیکی
 * اجازه می‌دهد رتبه‌بندی بر اساس نیتِ کاربر عوض شود.
 */
export const review = mysqlTable(
  'review',
  {
    id: int('id').autoincrement().primaryKey(),
    placeId: int('place_id')
      .notNull()
      .references(() => place.id, { onDelete: 'cascade' }),
    userId: char('user_id', { length: 36 }).references(() => appUser.id, {
      onDelete: 'set null',
    }),
    /** نامِ نمایشی در لحظه‌ی ثبت — اگر کاربر حذف شد، نظر بی‌نام نمی‌شود. */
    authorName: varchar('author_name', { length: 120 }).notNull().default(''),
    stars: tinyint('stars').notNull(),
    text: text('text'),
    ratingCoffee: tinyint('rating_coffee'),
    ratingFood: tinyint('rating_food'),
    ratingVibe: tinyint('rating_vibe'),
    ratingService: tinyint('rating_service'),
    ratingValue: tinyint('rating_value'),
    visitDate: date('visit_date'),
    status: mysqlEnum('status', ['pending', 'approved', 'rejected', 'spam'])
      .notNull()
      .default('pending'),
    helpfulCount: int('helpful_count').notNull().default(0),
    moderatedByUserId: char('moderated_by_user_id', { length: 36 }),
    moderatedAt: timestamp('moderated_at'),
    rejectReason: varchar('reject_reason', { length: 255 }),
    /** نشانِ نقش در لحظهٔ ثبت؛ با تغییر نقش، سابقهٔ تحریریه‌ای از بین نمی‌رود. */
    isBloggerReview: boolean('is_blogger_review').notNull().default(false),
    /** لینک مستقیم Reel/Post اینستاگرام؛ فقط Backend برای نقش blogger می‌پذیرد. */
    videoUrl: varchar('video_url', { length: 500 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('review_place_idx').on(t.placeId, t.status),
    index('review_user_idx').on(t.userId),
    index('review_status_idx').on(t.status, t.createdAt),
  ],
)

export const reviewPhoto = mysqlTable(
  'review_photo',
  {
    reviewId: int('review_id')
      .notNull()
      .references(() => review.id, { onDelete: 'cascade' }),
    mediaId: int('media_id')
      .notNull()
      .references(() => media.id),
    sortOrder: tinyint('sort_order').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.reviewId, t.mediaId] })],
)

/** آیتم‌هایی که نویسندهٔ نظر واقعاً سفارش داده است — چند انتخاب برای هر نظر. */
export const reviewItem = mysqlTable(
  'review_item',
  {
    reviewId: int('review_id').notNull().references(() => review.id, { onDelete: 'cascade' }),
    menuItemId: int('menu_item_id').notNull().references(() => menuItem.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.reviewId, t.menuItemId] }),
    index('review_item_menu_item_idx').on(t.menuItemId),
  ],
)

export const reviewVote = mysqlTable(
  'review_vote',
  {
    reviewId: int('review_id')
      .notNull()
      .references(() => review.id, { onDelete: 'cascade' }),
    userId: char('user_id', { length: 36 })
      .notNull()
      .references(() => appUser.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.reviewId, t.userId] })],
)

/** پاسخ کافه‌دار به نظر — از پنل کافه. */
export const reviewReply = mysqlTable(
  'review_reply',
  {
    id: int('id').autoincrement().primaryKey(),
    reviewId: int('review_id')
      .notNull()
      .references(() => review.id, { onDelete: 'cascade' }),
    userId: char('user_id', { length: 36 }).references(() => appUser.id, {
      onDelete: 'set null',
    }),
    text: text('text').notNull(),
    status: mysqlEnum('status', ['pending', 'approved', 'rejected'])
      .notNull()
      .default('approved'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [index('review_reply_review_idx').on(t.reviewId)],
)

/** کافه‌ای که کاربر از پنل خودش ثبت کرده — تا تأیید ادمین منتشر نمی‌شود. */
export const placeSubmission = mysqlTable(
  'place_submission',
  {
    id: int('id').autoincrement().primaryKey(),
    userId: char('user_id', { length: 36 }).references(() => appUser.id, {
      onDelete: 'set null',
    }),
    name: varchar('name', { length: 200 }).notNull(),
    payload: json('payload').notNull(),
    status: mysqlEnum('status', ['pending', 'approved', 'rejected', 'duplicate'])
      .notNull()
      .default('pending'),
    /** مکانِ ساخته‌شده بعد از تأیید. */
    placeId: int('place_id').references(() => place.id, { onDelete: 'set null' }),
    reviewedByUserId: char('reviewed_by_user_id', { length: 36 }),
    reviewedAt: timestamp('reviewed_at'),
    note: varchar('note', { length: 500 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [index('place_submission_status_idx').on(t.status, t.createdAt)],
)

export const editSuggestion = mysqlTable(
  'edit_suggestion',
  {
    id: int('id').autoincrement().primaryKey(),
    placeId: int('place_id')
      .notNull()
      .references(() => place.id, { onDelete: 'cascade' }),
    userId: char('user_id', { length: 36 }).references(() => appUser.id, {
      onDelete: 'set null',
    }),
    field: varchar('field', { length: 64 }).notNull(),
    currentValue: text('current_value'),
    suggestedValue: text('suggested_value').notNull(),
    status: mysqlEnum('status', ['pending', 'applied', 'rejected']).notNull().default('pending'),
    reviewedByUserId: char('reviewed_by_user_id', { length: 36 }),
    reviewedAt: timestamp('reviewed_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [index('edit_suggestion_status_idx').on(t.status, t.createdAt)],
)

/** Sales intake is not a public place submission and never grants ownership. */
export const venueLead = mysqlTable('venue_lead', {
  id: char('id', { length: 36 }).primaryKey(),
  trackingCode: char('tracking_code', { length: 24 }).notNull(),
  requestHash: char('request_hash', { length: 64 }).notNull(),
  dedupeKey: char('dedupe_key', { length: 64 }).notNull(),
  contactName: varchar('contact_name', { length: 120 }).notNull(),
  contactPhone: varchar('contact_phone', { length: 20 }).notNull(),
  cafeName: varchar('cafe_name', { length: 160 }).notNull(),
  city: varchar('city', { length: 80 }).notNull(),
  branch: varchar('branch', { length: 120 }).notNull().default(''),
  source: varchar('source', { length: 40 }).notNull().default('direct'),
  consentAt: timestamp('consent_at').notNull(),
  status: mysqlEnum('status', ['new', 'contacted', 'demo', 'review', 'active', 'rejected', 'closed']).notNull().default('new'),
  userId: char('user_id', { length: 36 }).references(() => appUser.id, { onDelete: 'set null' }),
  placeId: int('place_id').references(() => place.id, { onDelete: 'set null' }),
  claimId: int('claim_id').references(() => placeClaim.id, { onDelete: 'set null' }),
  assignedToUserId: char('assigned_to_user_id', { length: 36 }).references(() => appUser.id, { onDelete: 'set null' }),
  nextFollowUpAt: timestamp('next_follow_up_at'),
  internalNote: text('internal_note'),
  revision: int('revision').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
}, t => [
  uniqueIndex('venue_lead_tracking_uq').on(t.trackingCode),
  uniqueIndex('venue_lead_request_uq').on(t.requestHash),
  uniqueIndex('venue_lead_dedupe_uq').on(t.dedupeKey),
  index('venue_lead_status_idx').on(t.status, t.nextFollowUpAt),
  index('venue_lead_phone_idx').on(t.contactPhone),
])

/** HMAC keys, not raw IP/phone; fixed hourly buckets shared across workers. */
export const venueLeadRate = mysqlTable('venue_lead_rate', {
  key: char('bucket_key', { length: 64 }).primaryKey(),
  windowStart: timestamp('window_start').notNull(),
  requests: int('requests').notNull().default(1),
}, t => [index('venue_lead_rate_window_idx').on(t.windowStart)])

export const placeClaim = mysqlTable(
  'place_claim',
  {
    id: int('id').autoincrement().primaryKey(),
    placeId: int('place_id')
      .notNull()
      .references(() => place.id, { onDelete: 'cascade' }),
    userId: char('user_id', { length: 36 })
      .notNull()
      .references(() => appUser.id, { onDelete: 'cascade' }),
    status: mysqlEnum('status', ['pending', 'approved', 'rejected']).notNull().default('pending'),
    note: varchar('note', { length: 500 }),
    contactPhone: varchar('contact_phone', { length: 20 }),
    reviewedByUserId: char('reviewed_by_user_id', { length: 36 }),
    reviewedAt: timestamp('reviewed_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [index('place_claim_status_idx').on(t.status, t.createdAt)],
)

// ═══════════════════════════════════════════════════════════════════════
// عملیات و آمار
// ═══════════════════════════════════════════════════════════════════════

/** بدون این، برگرداندن یک ایمپورت خراب یا یک ویرایش اشتباه ممکن نیست. */
export const auditLog = mysqlTable(
  'audit_log',
  {
    id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
    actorUserId: char('actor_user_id', { length: 36 }),
    actorLabel: varchar('actor_label', { length: 120 }).notNull().default(''),
    action: varchar('action', { length: 64 }).notNull(),
    entity: varchar('entity', { length: 64 }).notNull(),
    entityId: varchar('entity_id', { length: 64 }).notNull(),
    before: json('before'),
    after: json('after'),
    ip: varchar('ip', { length: 64 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('audit_entity_idx').on(t.entity, t.entityId),
    index('audit_actor_idx').on(t.actorUserId, t.createdAt),
  ],
)

/**
 * ورود ادمین به پنل دیگران.
 *
 * قابلیت لازم است، ولی بدون رد پا خطرناک است: باید همیشه بشود گفت «این
 * تغییر را خودِ کافه‌دار زد یا ادمینی که جای او وارد شده بود».
 */
export const impersonationLog = mysqlTable(
  'impersonation_log',
  {
    id: int('id').autoincrement().primaryKey(),
    adminUserId: char('admin_user_id', { length: 36 }).notNull(),
    targetUserId: char('target_user_id', { length: 36 }),
    targetPlaceId: int('target_place_id'),
    reason: varchar('reason', { length: 255 }),
    startedAt: timestamp('started_at').notNull().defaultNow(),
    endedAt: timestamp('ended_at'),
  },
  (t) => [index('impersonation_admin_idx').on(t.adminUserId, t.startedAt)],
)

/**
 * لاگ جست‌وجو — باارزش‌ترین جدول تحلیلی.
 * `result_count = 0` مستقیماً می‌گوید چه داده‌ای کم دارید.
 */
export const searchLog = mysqlTable(
  'search_log',
  {
    id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
    query: varchar('query', { length: 255 }).notNull().default(''),
    requestedScope: mysqlEnum('requested_scope', ['all', 'places', 'items'])
      .notNull()
      .default('all'),
    resolvedEntity: mysqlEnum('resolved_entity', ['places', 'items'])
      .notNull()
      .default('places'),
    resolvedIntent: varchar('resolved_intent', { length: 80 }),
    facetIds: varchar('facet_ids', { length: 500 }).notNull().default(''),
    dishId: int('dish_id'),
    districtId: varchar('district_id', { length: 48 }),
    sort: varchar('sort', { length: 32 }),
    priceMax: int('price_max'),
    nearMe: boolean('near_me').notNull().default(false),
    resultCount: int('result_count').notNull(),
    clickedPlaceId: int('clicked_place_id'),
    clickedRank: int('clicked_rank'),
    userId: char('user_id', { length: 36 }),
    sessionId: char('session_id', { length: 36 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('search_log_created_idx').on(t.createdAt),
    index('search_log_zero_idx').on(t.resultCount),
    index('search_log_zero_entity_idx').on(t.resultCount, t.resolvedEntity, t.createdAt),
  ],
)

/** بازدید صفحه — ورودی خام آمار پنل ادمین. */
export const pageView = mysqlTable(
  'page_view',
  {
    id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
    path: varchar('path', { length: 300 }).notNull(),
    placeId: int('place_id'),
    userId: char('user_id', { length: 36 }),
    /** شناسه‌ی بی‌نامِ بازدیدکننده — کوکی، نه IP. برای شمردن «یکتا». */
    visitorId: char('visitor_id', { length: 36 }),
    referrer: varchar('referrer', { length: 500 }),
    device: mysqlEnum('device', ['mobile', 'tablet', 'desktop', 'bot', 'unknown'])
      .notNull()
      .default('unknown'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('page_view_created_idx').on(t.createdAt),
    index('page_view_place_idx').on(t.placeId, t.createdAt),
  ],
)

/**
 * رول‌آپ روزانه.
 *
 * `page_view` سریع بزرگ می‌شود و شمردن زنده‌اش نمودار پنل ادمین را کند
 * می‌کند. این جدول همان اعداد را از قبل حساب‌شده نگه می‌دارد.
 */
export const venueQrLink = mysqlTable('venue_qr_link', {
  id: int('id').autoincrement().primaryKey(),
  placeId: int('place_id').notNull().references(() => place.id, { onDelete: 'cascade' }),
  token: char('token', { length: 32 }).notNull(),
  label: varchar('label', { length: 80 }).notNull(),
  labelKey: varchar('label_key', { length: 80 }).notNull(),
  kind: mysqlEnum('kind', ['table', 'channel']).notNull(),
  active: boolean('active').notNull().default(true),
  opens: bigint('opens', { mode: 'number', unsigned: true }).notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, t => [uniqueIndex('venue_qr_token_uq').on(t.token), uniqueIndex('venue_qr_label_uq').on(t.placeId, t.labelKey)])

export const dailyStat = mysqlTable(
  'daily_stat',
  {
    day: date('day').notNull(),
    metric: varchar('metric', { length: 64 }).notNull(),
    refId: varchar('ref_id', { length: 64 }).notNull().default(''),
    value: int('value').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.day, t.metric, t.refId] })],
)

/** تنظیمات قابل ویرایش از پنل ادمین — بدون ری‌دیپلوی. */
export const setting = mysqlTable('setting', {
  key: varchar('key', { length: 64 }).primaryKey(),
  value: json('value'),
  updatedByUserId: char('updated_by_user_id', { length: 36 }),
  updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
})

// ═══════════════════════════════════════════════════════════════════════
// روابط (برای پرس‌وجوهای رابطه‌ای drizzle)
// ═══════════════════════════════════════════════════════════════════════

export const placeRelations = relations(place, ({ one, many }) => ({
  brand: one(placeBrand, { fields: [place.brandId], references: [placeBrand.id] }),
  district: one(district, { fields: [place.districtId], references: [district.id] }),
  logo: one(media, { fields: [place.logoMediaId], references: [media.id] }),
  phones: many(placePhone),
  socials: many(placeSocial),
  hours: many(placeHours),
  sections: many(menuSection),
  items: many(menuItem),
  photos: many(placePhoto),
  facets: many(placeFacet),
  dishes: many(placeDish),
  attributes: many(placeAttribute),
  reviews: many(review),
}))

export const placeBrandRelations = relations(placeBrand, ({ many }) => ({
  branches: many(place),
}))

export const menuSectionRelations = relations(menuSection, ({ one, many }) => ({
  place: one(place, { fields: [menuSection.placeId], references: [place.id] }),
  image: one(media, { fields: [menuSection.mediaId], references: [media.id] }),
  items: many(menuItem),
}))

export const menuItemRelations = relations(menuItem, ({ one, many }) => ({
  section: one(menuSection, { fields: [menuItem.sectionId], references: [menuSection.id] }),
  place: one(place, { fields: [menuItem.placeId], references: [place.id] }),
  image: one(media, { fields: [menuItem.mediaId], references: [media.id] }),
  dish: one(dish, { fields: [menuItem.dishId], references: [dish.id] }),
  variants: many(menuItemVariant),
  reviews: many(reviewItem),
}))

export const menuItemVariantRelations = relations(menuItemVariant, ({ one }) => ({
  item: one(menuItem, { fields: [menuItemVariant.itemId], references: [menuItem.id] }),
}))

export const reviewRelations = relations(review, ({ one, many }) => ({
  place: one(place, { fields: [review.placeId], references: [place.id] }),
  author: one(appUser, { fields: [review.userId], references: [appUser.id] }),
  photos: many(reviewPhoto),
  replies: many(reviewReply),
  items: many(reviewItem),
}))

export const reviewItemRelations = relations(reviewItem, ({ one }) => ({
  review: one(review, { fields: [reviewItem.reviewId], references: [review.id] }),
  menuItem: one(menuItem, { fields: [reviewItem.menuItemId], references: [menuItem.id] }),
}))

export const appUserRelations = relations(appUser, ({ many }) => ({
  placeRoles: many(userPlaceRole),
  preferences: many(userPreference),
  saved: many(savedPlace),
  reviews: many(review),
}))
