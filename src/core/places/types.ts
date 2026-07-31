/**
 * مدل دامنه‌ی مکان.
 *
 * تفاوت‌های کلیدی با `src/types/index.ts` قدیمی — هرکدام یک نقص واقعی را
 * می‌بندد (بخش ۲ سند معماری):
 *
 *   + `coords`        مختصات واقعی. قبلاً `distanceKm` عددِ ثابت بود، پس
 *                     سورت «نزدیک‌ترین» تقلبی بود.
 *   + `status`        چرخه‌ی حیات. دایرکتوری *باید* بلد باشد «اینجا تعطیل شد».
 *   + `slug`          جدا از `name`، تا تغییر نام کافه آدرس صفحه را نشکند.
 *   + `attributes`    شناسه‌محور با درجه و منبع — نه رشته‌ی آزاد.
 *   + `verification`  کِی و توسط چه کسی تأیید شد.
 *   − `isOpen`        حذف شد؛ حالا از ساعت کاری محاسبه می‌شود.
 *   − `rating`        حذف شد؛ از sum/count با میانگین بیزی محاسبه می‌شود.
 *   − `distanceKm`    حذف شد؛ از مختصات محاسبه می‌شود.
 */

export type PlaceStatus =
  | 'draft'
  | 'published'
  | 'temporarily_closed'
  | 'permanently_closed'
  | 'merged'

export type PlaceKind = 'cafe' | 'cafe_restaurant' | 'restaurant'

export type PriceTier = 1 | 2 | 3

/** منبع یک قلم داده — وزن اعتماد از همین می‌آید. */
export type DataSource =
  | 'field_visit' // بازدید میدانی تیم — بالاترین اعتماد
  | 'owner' // خودِ کافه‌دار
  | 'user' // پیشنهاد اصلاح کاربر
  | 'instagram' // استخراج از اینستاگرام، بازبینی‌شده
  | 'inferred' // محاسبه‌شده از بقیه‌ی داده

export interface Coords {
  lat: number
  lng: number
}

/**
 * ویژگی با درجه، نه boolean.
 *
 * «پریز دارد» جواب دودویی ندارد؛ جواب واقعی «چندتایی هست ولی نه سر همه‌ی
 * میزها» است. boolean این را به دروغ تبدیل می‌کند.
 */
export type AttributeValue = 0 | 1 | 2 // 0 نه · 1 تاحدی · 2 بله

export interface PlaceAttribute {
  attributeId: string
  value: AttributeValue
  /** ۰..۱۰۰ */
  confidence: number
  source: DataSource
  verifiedAt: string | null
}

export interface OpeningHour {
  /** ۰ = شنبه (هفته‌ی ایرانی) … ۶ = جمعه */
  dow: number
  /** «HH:MM» ۲۴ساعته، ASCII. نمایش فارسی کارِ لایه‌ی UI است. */
  opensAt: string
  closesAt: string
  /** بستن بعد از نیمه‌شب، مثلاً ۱۰:۰۰ تا ۰۲:۰۰ */
  crossesMidnight: boolean
  closed: boolean
}

/** استثنای ساعت کاری — تعطیلات رسمی، ماه رمضان، تعطیلی موقت. */
export interface HoursException {
  /** «YYYY-MM-DD» میلادی */
  date: string
  closed: boolean
  opensAt?: string
  closesAt?: string
  reason?: string
}

export interface MenuItem {
  id: string
  name: string
  en?: string
  desc?: string
  /** تومان */
  price: number
  discount?: number | null
  active: boolean
  /**
   * کِی این قیمت تأیید شد. با تورم ایران قیمت منو ظرف چند هفته غلط می‌شود؛
   * بدون این فیلد نمی‌شود فهمید کدام قیمت دیگر قابل نمایش نیست.
   */
  priceUpdatedAt: string | null
}

export interface MenuSection {
  id: string
  name: string
  items: MenuItem[]
}

export interface Review {
  id: string
  author: string
  stars: number
  /** ISO 8601 — نه «۳ روز پیش». آن یکی کارِ لایه‌ی نمایش است. */
  createdAt: string
  text: string
  badge?: string
}

export interface PlacePhoto {
  id: string
  url: string
  alt: string
  width?: number
  height?: number
}

/** ردِ منشأ برای یک فیلد مشخص — پایه‌ی سیستم اعتماد. */
export interface FieldProvenance {
  field: string
  source: DataSource
  confidence: number
  observedAt: string
}

export interface District {
  id: string
  slug: string
  name: string
  center: Coords
}

/** رکورد کامل مکان، آن‌طور که در دیتابیس ذخیره می‌شود. */
export interface Place {
  id: string
  slug: string
  name: string
  nameNormalized: string
  kind: PlaceKind
  status: PlaceStatus
  mergedInto: string | null

  coords: Coords | null
  address: string
  districtId: string

  priceTier: PriceTier
  phone: string | null
  instagram: string | null

  /** مجموع امتیازها و تعداد — میانگین از این‌ها مشتق می‌شود، ذخیره نمی‌شود. */
  ratingSum: number
  ratingCount: number

  attributes: PlaceAttribute[]
  hours: OpeningHour[]
  hoursExceptions: HoursException[]
  menu: MenuSection[]
  reviews: Review[]
  photos: PlacePhoto[]
  provenance: FieldProvenance[]

  /** برچسب تحریریه‌ای، مثلاً «منتخب سردبیر». */
  ribbon?: string
  description?: string

  lastVerifiedAt: string | null
  createdAt: string
  updatedAt: string
}

/**
 * نمای مکان بعد از محاسبه‌ی مقادیر مشتق — همان چیزی که به UI می‌رود.
 * هیچ‌کدام از این فیلدها در دیتابیس ذخیره نمی‌شوند.
 */
export interface PlaceView extends Place {
  /** میانگین بیزی — نه میانگین خام. */
  rating: number
  /** میانگین خام، فقط برای نمایش «۴٫۸ از ۱۴۲ نظر». */
  rawRating: number
  isOpenNow: boolean
  /** «تا ۲۳:۰۰ باز است» یا «بسته — شنبه ۰۹:۰۰ باز می‌شود» */
  openLabel: string
  openSubLabel: string
  /** کیلومتر از کاربر — فقط وقتی مختصات کاربر معلوم باشد. */
  distanceKm: number | null
  /** ۰..۱۰۰ کامل‌بودن پروفایل. */
  qualityScore: number
  /** ۰..۱۰۰ تازگی داده. */
  freshnessScore: number
  /** شناسه‌ی ویژگی‌هایی که مقدارشان ≥۱ است — برای فیلتر و نمایش chip. */
  activeAttributeIds: string[]
}
