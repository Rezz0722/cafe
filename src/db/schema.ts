/**
 * شمای Postgres — مقصد تولیدی.
 *
 * این فایل مرجعِ ساختار دیتابیس است. اپلیکیشن از طریق
 * `src/core/places/repository.ts` با داده کار می‌کند، پس تا وقتی Postgres
 * بالا نیامده هم قابل اجراست (آداپتور seed).
 *
 * نکته‌ی PostGIS: Drizzle نوع `geography` بومی ندارد، پس با `customType`
 * تعریف شده. ایندکس GiST در migration دستی اضافه می‌شود — پایین توضیح داده شده.
 */

import {
  boolean,
  customType,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

/** `geography(Point, 4326)` — نقطه روی کره‌ی زمین با WGS84. */
const geography = customType<{ data: { lat: number; lng: number }; driverData: string }>({
  dataType: () => 'geography(Point, 4326)',
  toDriver: (v) => `SRID=4326;POINT(${v.lng} ${v.lat})`,
})

export const placeStatus = pgEnum('place_status', [
  'draft',
  'published',
  'temporarily_closed',
  'permanently_closed',
  'merged',
])

export const placeKind = pgEnum('place_kind', ['cafe', 'cafe_restaurant', 'restaurant'])

export const dataSource = pgEnum('data_source', [
  'field_visit',
  'owner',
  'user',
  'instagram',
  'inferred',
])

export const attributeKind = pgEnum('attribute_kind', ['intent', 'amenity', 'vibe'])

// ── محله ─────────────────────────────────────────────────────────────

export const district = pgTable('district', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  centerLat: text('center_lat').notNull(),
  centerLng: text('center_lng').notNull(),
})

// ── واژگان ویژگی‌ها ──────────────────────────────────────────────────
// شناسه‌ی متنی پایدار، نه سریال. همان چیزی که باگ تگ رشته‌ای را می‌بندد.

export const attribute = pgTable('attribute', {
  id: text('id').primaryKey(),
  labelFa: text('label_fa').notNull(),
  kind: attributeKind('kind').notNull(),
  isFilter: boolean('is_filter').notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
  hint: text('hint'),
})

// ── مکان ─────────────────────────────────────────────────────────────

export const place = pgTable(
  'place',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    nameNormalized: text('name_normalized').notNull(),
    kind: placeKind('kind').notNull(),
    status: placeStatus('status').notNull().default('draft'),
    mergedInto: uuid('merged_into'),

    geog: geography('geog'),
    address: text('address').notNull().default(''),
    districtId: text('district_id').references(() => district.id),

    priceTier: smallint('price_tier').notNull().default(2),
    phone: text('phone'),
    instagram: text('instagram'),

    ratingSum: integer('rating_sum').notNull().default(0),
    ratingCount: integer('rating_count').notNull().default(0),

    ribbon: text('ribbon'),
    description: text('description'),

    lastVerifiedAt: timestamp('last_verified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('place_status_idx').on(t.status),
    index('place_district_idx').on(t.districtId),
    index('place_name_norm_idx').on(t.nameNormalized),
  ],
)

/**
 * ایندکس‌هایی که Drizzle نمی‌تواند تولید کند — در migration دستی اضافه کنید:
 *
 *   CREATE EXTENSION IF NOT EXISTS postgis;
 *   CREATE EXTENSION IF NOT EXISTS pg_trgm;
 *   CREATE INDEX place_geog_idx ON place USING GIST (geog);
 *   CREATE INDEX place_name_trgm_idx ON place USING GIN (name_normalized gin_trgm_ops);
 *
 * اولی برای «نزدیک من» و block کردن dedupe؛ دومی برای شباهت نام در dedupe.
 */

// ── ویژگی مکان ───────────────────────────────────────────────────────

export const placeAttribute = pgTable(
  'place_attribute',
  {
    placeId: uuid('place_id')
      .notNull()
      .references(() => place.id, { onDelete: 'cascade' }),
    attributeId: text('attribute_id')
      .notNull()
      .references(() => attribute.id),
    /** ۰ نه · ۱ تاحدی · ۲ بله — عمداً boolean نیست. */
    value: smallint('value').notNull(),
    confidence: smallint('confidence').notNull().default(50),
    source: dataSource('source').notNull(),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.placeId, t.attributeId] })],
)

// ── ساعت کاری ────────────────────────────────────────────────────────

export const placeHours = pgTable('place_hours', {
  placeId: uuid('place_id')
    .notNull()
    .references(() => place.id, { onDelete: 'cascade' }),
  /** ۰ = شنبه */
  dow: smallint('dow').notNull(),
  opensAt: time('opens_at').notNull(),
  closesAt: time('closes_at').notNull(),
  crossesMidnight: boolean('crosses_midnight').notNull().default(false),
  closed: boolean('closed').notNull().default(false),
})

/**
 * استثنای ساعت کاری. اختیاری نیست: تعطیلات رسمی زیاد است و ساعت کاری در ماه
 * رمضان کاملاً عوض می‌شود.
 */
export const placeHoursException = pgTable('place_hours_exception', {
  placeId: uuid('place_id')
    .notNull()
    .references(() => place.id, { onDelete: 'cascade' }),
  date: date('date').notNull(),
  closed: boolean('closed').notNull().default(true),
  opensAt: time('opens_at'),
  closesAt: time('closes_at'),
  reason: text('reason'),
})

// ── منو ──────────────────────────────────────────────────────────────

export const menuSection = pgTable('menu_section', {
  id: uuid('id').primaryKey().defaultRandom(),
  placeId: uuid('place_id')
    .notNull()
    .references(() => place.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
})

export const menuItem = pgTable('menu_item', {
  id: uuid('id').primaryKey().defaultRandom(),
  sectionId: uuid('section_id')
    .notNull()
    .references(() => menuSection.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  nameEn: text('name_en'),
  description: text('description'),
  price: integer('price').notNull(),
  discount: smallint('discount'),
  active: boolean('active').notNull().default(true),
  /** بدون این، قیمتِ بیات را به‌عنوان قیمت روز نشان می‌دهید. */
  priceUpdatedAt: timestamp('price_updated_at', { withTimezone: true }),
})

// ── عکس و نظر ────────────────────────────────────────────────────────

export const placePhoto = pgTable('place_photo', {
  id: uuid('id').primaryKey().defaultRandom(),
  placeId: uuid('place_id')
    .notNull()
    .references(() => place.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  alt: text('alt').notNull().default(''),
  width: integer('width'),
  height: integer('height'),
  sortOrder: integer('sort_order').notNull().default(0),
})

export const review = pgTable(
  'review',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    placeId: uuid('place_id')
      .notNull()
      .references(() => place.id, { onDelete: 'cascade' }),
    authorName: text('author_name').notNull(),
    stars: smallint('stars').notNull(),
    text: text('text').notNull().default(''),
    badge: text('badge'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('review_place_idx').on(t.placeId)],
)

// ── منشأ داده ────────────────────────────────────────────────────────

/**
 * ردِ منشأ در سطح فیلد. سه قابلیت را ممکن می‌کند که بدونش هیچ‌کدام شدنی نیست:
 * حل تعارض بین منابع، تشخیص بیات‌شدن، و نمایش «آخرین بررسی» به کاربر.
 */
export const fieldProvenance = pgTable(
  'field_provenance',
  {
    placeId: uuid('place_id')
      .notNull()
      .references(() => place.id, { onDelete: 'cascade' }),
    field: text('field').notNull(),
    source: dataSource('source').notNull(),
    valueHash: text('value_hash').notNull().default(''),
    confidence: smallint('confidence').notNull().default(50),
    observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.placeId, t.field, t.source] })],
)

// ── چرخه‌ی مشارکت ────────────────────────────────────────────────────

export const appUser = pgTable('app_user', {
  id: uuid('id').primaryKey().defaultRandom(),
  phone: text('phone').notNull().unique(),
  name: text('name').notNull().default(''),
  role: text('role').notNull().default('customer'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

/** تصاحب صفحه توسط مالک — نیاز به تأیید دستی دارد. */
export const placeClaim = pgTable('place_claim', {
  id: uuid('id').primaryKey().defaultRandom(),
  placeId: uuid('place_id')
    .notNull()
    .references(() => place.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => appUser.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('pending'),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

/** پیشنهاد اصلاح کاربر — ورودی صف کیفیت داده. */
export const editSuggestion = pgTable('edit_suggestion', {
  id: uuid('id').primaryKey().defaultRandom(),
  placeId: uuid('place_id')
    .notNull()
    .references(() => place.id, { onDelete: 'cascade' }),
  field: text('field').notNull(),
  suggestedValue: text('suggested_value').notNull(),
  status: text('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

/** بدون این، برگرداندن یک import خراب ممکن نیست. */
export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  actor: text('actor').notNull(),
  action: text('action').notNull(),
  entity: text('entity').notNull(),
  entityId: text('entity_id').notNull(),
  before: text('before'),
  after: text('after'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * لاگ جست‌وجو — باارزش‌ترین جدول تحلیلی.
 * `result_count = 0` مستقیماً می‌گوید چه داده‌ای کم دارید.
 */
export const searchLog = pgTable('search_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  query: text('query').notNull().default(''),
  attributeIds: text('attribute_ids').notNull().default(''),
  districtId: text('district_id'),
  resultCount: integer('result_count').notNull(),
  clickedRank: integer('clicked_rank'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
