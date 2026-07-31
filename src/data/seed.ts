/**
 * ⚠️  داده‌ی نمونه — واقعی نیست.
 *
 * نام کافه‌ها از همان پنج ماکاپ طراحی آمده‌اند و کسب‌وکار واقعی نیستند.
 * ساعت کاری، منو، قیمت و نظرات هم ساختگی‌اند و فقط برای این وجود دارند که
 * محصول با شکل واقعیِ داده اجرا شود.
 *
 * تنها چیزی که اینجا واقعی است، مختصات مراکز محله‌های مشهد است (جغرافیای
 * عمومی، نه داده‌ی کسب‌وکار) — تا فاصله و نقشه معنادار کار کنند.
 *
 * ═══ این فایل جایگزین بازدید میدانی نیست ═══
 *
 * ارزش محصول از ۲۰۰ تا ۳۰۰ کافه‌ی واقعیِ تأییدشده می‌آید (بخش ۳ و فاز ۱ سند
 * معماری). این seed فقط اسکلت است. مسیر جایگزینی‌اش در docs/DATA_LAYER.md.
 */

import type { District, Place, PlaceAttribute, OpeningHour } from '@/core/places/types'
import { normalizePlaceName } from '@/core/text/normalize'

// ── محله‌های مشهد (مختصات تقریبیِ واقعی) ────────────────────────────

export const SEED_DISTRICTS: District[] = [
  { id: 'sajad', slug: 'sajad', name: 'سجاد', center: { lat: 36.3157, lng: 59.5391 } },
  { id: 'ahmadabad', slug: 'ahmadabad', name: 'احمدآباد', center: { lat: 36.2977, lng: 59.5895 } },
  { id: 'kuhsangi', slug: 'kuhsangi', name: 'کوهسنگی', center: { lat: 36.2856, lng: 59.5836 } },
  { id: 'vakilabad', slug: 'vakilabad', name: 'وکیل‌آباد', center: { lat: 36.3298, lng: 59.479 } },
  { id: 'rahnamaei', slug: 'rahnamaei', name: 'راهنمایی', center: { lat: 36.307, lng: 59.5666 } },
  { id: 'ghasemabad', slug: 'ghasemabad', name: 'قاسم‌آباد', center: { lat: 36.355, lng: 59.465 } },
]

// ── کمک‌کننده‌ها ─────────────────────────────────────────────────────

const now = Date.now()
const daysAgo = (n: number) => new Date(now - n * 86_400_000).toISOString()

/** ساعت کاری یکنواخت هفت‌روزه. */
function hours(opensAt: string, closesAt: string, crossesMidnight = false): OpeningHour[] {
  return Array.from({ length: 7 }, (_, dow) => ({
    dow,
    opensAt,
    closesAt,
    crossesMidnight,
    closed: false,
  }))
}

/** ساعت کاری با یک روز تعطیل. */
function hoursWithClosedDay(
  opensAt: string,
  closesAt: string,
  closedDow: number,
  crossesMidnight = false,
): OpeningHour[] {
  return hours(opensAt, closesAt, crossesMidnight).map((h) =>
    h.dow === closedDow ? { ...h, closed: true } : h,
  )
}

/**
 * ویژگی‌ها را از یک نگاشت فشرده می‌سازد.
 * `[id, value]` — value: ۰ نه · ۱ تاحدی · ۲ بله
 */
function attrs(
  entries: [string, 0 | 1 | 2][],
  source: PlaceAttribute['source'] = 'field_visit',
  verifiedDaysAgo = 20,
): PlaceAttribute[] {
  return entries.map(([attributeId, value]) => ({
    attributeId,
    value,
    confidence: source === 'field_visit' ? 90 : 60,
    source,
    verifiedAt: daysAgo(verifiedDaysAgo),
  }))
}

function provenance(daysAgoMap: Record<string, number>) {
  return Object.entries(daysAgoMap).map(([field, d]) => ({
    field,
    source: 'field_visit' as const,
    confidence: 90,
    observedAt: daysAgo(d),
  }))
}

const PHOTO = '/cafe-photo.webp'

function photos(placeId: string, alt: string, count = 3) {
  return Array.from({ length: count }, (_, i) => ({
    id: `${placeId}-photo-${i + 1}`,
    url: PHOTO,
    alt: `${alt} — تصویر ${i + 1}`,
    width: 1200,
    height: 800,
  }))
}

interface SeedInput {
  slug: string
  name: string
  kind: Place['kind']
  districtId: string
  coords: { lat: number; lng: number }
  address: string
  priceTier: Place['priceTier']
  phone?: string
  instagram?: string
  ratingSum: number
  ratingCount: number
  attributes: PlaceAttribute[]
  hours: OpeningHour[]
  ribbon?: string
  description?: string
  menu?: Place['menu']
  reviews?: Place['reviews']
  verifiedDaysAgo?: number
}

function makePlace(input: SeedInput): Place {
  const verified = input.verifiedDaysAgo ?? 20
  return {
    id: input.slug,
    slug: input.slug,
    name: input.name,
    nameNormalized: normalizePlaceName(input.name),
    kind: input.kind,
    status: 'published',
    mergedInto: null,
    coords: input.coords,
    address: input.address,
    districtId: input.districtId,
    priceTier: input.priceTier,
    phone: input.phone ?? null,
    instagram: input.instagram ?? null,
    ratingSum: input.ratingSum,
    ratingCount: input.ratingCount,
    attributes: input.attributes,
    hours: input.hours,
    hoursExceptions: [],
    menu: input.menu ?? [],
    reviews: input.reviews ?? [],
    photos: photos(input.slug, input.name),
    provenance: provenance({
      hours: verified,
      menu: verified + 10,
      phone: verified + 40,
      address: verified + 60,
      attributes: verified,
    }),
    ribbon: input.ribbon,
    description: input.description,
    lastVerifiedAt: daysAgo(verified),
    createdAt: daysAgo(180),
    updatedAt: daysAgo(verified),
  }
}

// ── منوی نمونه ───────────────────────────────────────────────────────

function sampleMenu(prefix: string): Place['menu'] {
  const priceUpdatedAt = daysAgo(25)
  return [
    {
      id: `${prefix}-hot`,
      name: 'نوشیدنی گرم',
      items: [
        { id: `${prefix}-esp`, name: 'اسپرسو', en: 'Espresso', price: 65_000, active: true, discount: null, priceUpdatedAt },
        { id: `${prefix}-lat`, name: 'لاته', en: 'Latte', price: 98_000, active: true, discount: null, priceUpdatedAt },
        { id: `${prefix}-cap`, name: 'کاپوچینو', en: 'Cappuccino', price: 95_000, active: true, discount: 10, priceUpdatedAt },
        { id: `${prefix}-v60`, name: 'دمی V60', en: 'V60', desc: 'قهوه‌ی تک‌خاستگاه، دم‌آوری دستی', price: 120_000, active: true, discount: null, priceUpdatedAt },
      ],
    },
    {
      id: `${prefix}-cold`,
      name: 'نوشیدنی سرد',
      items: [
        { id: `${prefix}-ice`, name: 'آیس لاته', en: 'Iced Latte', price: 110_000, active: true, discount: null, priceUpdatedAt },
        { id: `${prefix}-moj`, name: 'موهیتو', en: 'Mojito', price: 125_000, active: true, discount: null, priceUpdatedAt },
      ],
    },
    {
      id: `${prefix}-food`,
      name: 'خوراک',
      items: [
        { id: `${prefix}-cake`, name: 'چیزکیک', en: 'Cheesecake', price: 145_000, active: true, discount: null, priceUpdatedAt },
        { id: `${prefix}-brk`, name: 'صبحانه کامل', en: 'Full Breakfast', desc: 'تخم‌مرغ، پنیر، عسل، نان تازه', price: 320_000, active: true, discount: 15, priceUpdatedAt },
      ],
    },
  ]
}

function sampleReviews(prefix: string): Place['reviews'] {
  return [
    { id: `${prefix}-r1`, author: 'سارا م.', stars: 5, createdAt: daysAgo(3), text: 'فضاش خیلی آروم بود، تونستم دو ساعت راحت کار کنم. پریز هم کنار میز داشت.', badge: 'کاشف حرفه‌ای' },
    { id: `${prefix}-r2`, author: 'امیر ک.', stars: 4, createdAt: daysAgo(12), text: 'قهوه‌ش عالی بود ولی عصرها یه‌کم شلوغ می‌شه.' },
    { id: `${prefix}-r3`, author: 'نگین ر.', stars: 5, createdAt: daysAgo(28), text: 'برای قرار دوستانه عالیه. برخورد پرسنل خیلی خوب بود.' },
  ]
}

// ── مکان‌ها ──────────────────────────────────────────────────────────

export const SEED_PLACES: Place[] = [
  makePlace({
    slug: 'cafe-rof',
    name: 'کافه رُف',
    kind: 'cafe_restaurant',
    districtId: 'sajad',
    coords: { lat: 36.3171, lng: 59.5402 },
    address: 'مشهد، بلوار سجاد، نبش سجاد ۱۲',
    priceTier: 2,
    phone: '۰۵۱-۳۷۶۵۴۳۲۱',
    instagram: 'cafe_rof',
    ratingSum: 682,
    ratingCount: 142,
    ribbon: 'منتخب سردبیر',
    description: 'کافه‌رستورانی با تراس روباز مشرف به بلوار سجاد. فضای دنج داخلی برای کار و تراس برای دورهمی.',
    attributes: attrs([
      ['laptop_friendly', 2], ['cozy', 2], ['good_for_date', 2], ['outdoor', 2],
      ['power_outlets', 2], ['fast_wifi', 2], ['quiet', 1], ['long_stay_ok', 2],
      ['parking', 1], ['non_smoking', 2], ['natural_light', 2], ['specialty_coffee', 2],
    ]),
    hours: hours('09:00', '23:30'),
    menu: sampleMenu('rof'),
    reviews: sampleReviews('rof'),
    verifiedDaysAgo: 8,
  }),

  makePlace({
    slug: 'cafe-ketab-hezartu',
    name: 'کافه‌کتاب هزارتو',
    kind: 'cafe',
    districtId: 'ahmadabad',
    coords: { lat: 36.2991, lng: 59.5912 },
    address: 'مشهد، احمدآباد، خیابان قائم، پلاک ۴۲',
    priceTier: 1,
    phone: '۰۵۱-۳۸۴۴۱۱۲۲',
    instagram: 'hezartu_bookcafe',
    ratingSum: 459,
    ratingCount: 98,
    description: 'کافه‌کتاب با قفسه‌های باز و گوشه‌های ساکت. مقصد همیشگی دانشجوها برای مطالعه.',
    attributes: attrs([
      ['good_for_study', 2], ['cozy', 2], ['laptop_friendly', 2], ['quiet', 2],
      ['power_outlets', 2], ['fast_wifi', 1], ['long_stay_ok', 2],
      ['non_smoking', 2], ['natural_light', 1], ['specialty_coffee', 1], ['outdoor', 0],
    ]),
    hours: hours('08:00', '22:00'),
    menu: sampleMenu('hezartu'),
    reviews: sampleReviews('hezartu'),
    verifiedDaysAgo: 15,
  }),

  makePlace({
    slug: 'cafe-bame-sabz',
    name: 'کافه بام سبز',
    kind: 'cafe_restaurant',
    districtId: 'kuhsangi',
    coords: { lat: 36.2841, lng: 59.5849 },
    address: 'مشهد، کوهسنگی، بالای برج آسمان، طبقه ۱۲',
    priceTier: 3,
    phone: '۰۵۱-۳۸۹۰۰۹۹۸',
    instagram: 'bamesabz_cafe',
    ratingSum: 1029,
    ratingCount: 210,
    ribbon: 'محبوب محلی‌ها',
    description: 'روف‌گاردن با دید پانوراما به کوهسنگی. بهترین گزینه برای غروب و قرارهای خاص.',
    attributes: attrs([
      ['outdoor', 2], ['good_for_date', 2], ['family_friendly', 1], ['open_late', 2],
      ['parking', 2], ['natural_light', 2], ['specialty_coffee', 1],
      ['laptop_friendly', 0], ['quiet', 0], ['power_outlets', 0], ['long_stay_ok', 1],
    ]),
    hours: hours('16:00', '01:00', true),
    menu: sampleMenu('bamesabz'),
    reviews: sampleReviews('bamesabz'),
    verifiedDaysAgo: 22,
  }),

  makePlace({
    slug: 'espressokhane-note',
    name: 'اسپرسوخانهٔ نُت',
    kind: 'cafe',
    districtId: 'vakilabad',
    coords: { lat: 36.3312, lng: 59.4801 },
    address: 'مشهد، بلوار وکیل‌آباد، بین وکیل‌آباد ۲۲ و ۲۴',
    priceTier: 2,
    phone: '۰۵۱-۳۶۰۱۲۳۴۵',
    instagram: 'note_espresso',
    ratingSum: 352,
    ratingCount: 76,
    description: 'اسپرسوبار تخصصی با تمرکز روی تک‌خاستگاه و دم‌آوری دستی.',
    attributes: attrs([
      ['specialty_coffee', 2], ['laptop_friendly', 2], ['quiet', 2],
      ['power_outlets', 1], ['fast_wifi', 2], ['long_stay_ok', 1],
      ['non_smoking', 2], ['cozy', 1], ['outdoor', 0], ['parking', 0],
    ]),
    hours: hoursWithClosedDay('08:30', '22:30', 6),
    menu: sampleMenu('note'),
    reviews: sampleReviews('note'),
    verifiedDaysAgo: 11,
  }),

  makePlace({
    slug: 'cafe-hayat',
    name: 'کافه حیاط',
    kind: 'cafe',
    districtId: 'rahnamaei',
    coords: { lat: 36.3082, lng: 59.5679 },
    address: 'مشهد، راهنمایی، خیابان راهنمایی ۱۰، پلاک ۷',
    priceTier: 1,
    phone: '۰۵۱-۳۸۴۵۶۷۸۹',
    instagram: 'hayat_cafe_mashhad',
    ratingSum: 288,
    ratingCount: 64,
    description: 'خانه‌ی قدیمی بازسازی‌شده با حیاط مرکزی و حوض. صبحانه‌ی سنتی سرو می‌کند.',
    attributes: attrs([
      ['outdoor', 2], ['breakfast', 2], ['cozy', 2], ['family_friendly', 2],
      ['natural_light', 2], ['quiet', 1], ['long_stay_ok', 2],
      ['laptop_friendly', 1], ['power_outlets', 1], ['parking', 0],
    ]),
    hours: hours('07:30', '21:00'),
    menu: sampleMenu('hayat'),
    reviews: sampleReviews('hayat'),
    verifiedDaysAgo: 35,
  }),

  makePlace({
    slug: 'cafe-shab',
    name: 'کافه شب',
    kind: 'cafe',
    districtId: 'ghasemabad',
    coords: { lat: 36.3562, lng: 59.4668 },
    address: 'مشهد، قاسم‌آباد، بلوار اندیشه، اندیشه ۱۵',
    priceTier: 2,
    instagram: 'cafe_shab_mashhad',
    ratingSum: 231,
    ratingCount: 52,
    description: 'کافه‌ی شبانه با موسیقی زنده در آخر هفته‌ها.',
    attributes: attrs([
      ['open_late', 2], ['good_for_date', 2], ['cozy', 2],
      ['laptop_friendly', 1], ['power_outlets', 1], ['fast_wifi', 1],
      ['quiet', 0], ['outdoor', 1], ['parking', 1],
    ]),
    hours: hours('17:00', '02:00', true),
    menu: sampleMenu('shab'),
    reviews: sampleReviews('shab'),
    verifiedDaysAgo: 48,
  }),

  makePlace({
    slug: 'cafe-golha',
    name: 'کافه گل‌ها',
    kind: 'cafe_restaurant',
    districtId: 'sajad',
    coords: { lat: 36.3139, lng: 59.5368 },
    address: 'مشهد، بلوار سجاد، سجاد ۵، پلاک ۱۹',
    priceTier: 3,
    phone: '۰۵۱-۳۷۶۱۲۳۴۵',
    ratingSum: 401,
    ratingCount: 87,
    description: 'کافه‌رستوران با فضای گیاهی و منوی گیاه‌خواری.',
    attributes: attrs([
      ['family_friendly', 2], ['good_for_date', 2], ['breakfast', 2],
      ['natural_light', 2], ['non_smoking', 2], ['parking', 2],
      ['laptop_friendly', 1], ['quiet', 1], ['long_stay_ok', 1], ['outdoor', 1],
    ]),
    hours: hours('09:00', '23:00'),
    menu: sampleMenu('golha'),
    reviews: sampleReviews('golha'),
    verifiedDaysAgo: 62,
  }),

  makePlace({
    slug: 'cafe-darvish',
    name: 'قهوه‌خانه درویش',
    kind: 'cafe',
    districtId: 'ahmadabad',
    coords: { lat: 36.2962, lng: 59.5871 },
    address: 'مشهد، احمدآباد، خیابان پاستور، پلاک ۳',
    priceTier: 1,
    ratingSum: 178,
    ratingCount: 41,
    description: 'قهوه‌خانه‌ی سنتی با چای هیزمی و دیزی.',
    attributes: attrs([
      ['cozy', 2], ['family_friendly', 2], ['breakfast', 1],
      ['quiet', 1], ['long_stay_ok', 2], ['outdoor', 1],
      ['laptop_friendly', 0], ['power_outlets', 0], ['fast_wifi', 0],
    ], 'instagram', 95),
    hours: hours('06:00', '20:00'),
    menu: sampleMenu('darvish'),
    reviews: sampleReviews('darvish'),
    verifiedDaysAgo: 95,
  }),
]
