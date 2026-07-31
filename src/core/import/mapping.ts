/**
 * نگاشت داده‌ی خام ورودی به مدل دامنه.
 *
 * ═══ چرا این لایه لازم است ═══
 *
 * فایل ورودی ۱۰۰ کافه دارد با **۲۶۵ رشته‌ی متمایز** در `amenities` برای فقط
 * ۲۹۸ انتساب — یعنی تقریباً هر رشته یکتاست. این دقیقاً همان فساد تگ آزاد است
 * که در سند معماری هشدار داده شد، در دنیای واقعی.
 *
 * بدتر اینکه بیشترشان اصلاً «امکانات» نیستند: «پاستا پستو» و «چیزکیک مدرن»
 * آیتم منواند، «محیط دنج» توصیف حال‌وهواست، و «پارکینگ» امکانات واقعی است.
 * ریختن همه‌ی این‌ها در یک واژگان فیلتر، فیلتر را بی‌معنی می‌کند.
 *
 * راه‌حل، دو سطلِ جداست:
 *
 *   ۱. آنچه به شناسه‌ی شناخته‌شده نگاشت می‌شود → `attributes` (قابل فیلتر)
 *   ۲. باقی → `highlights` (فقط نمایش، غیرقابل فیلتر)
 *
 * سطل دوم مهم است: رشته‌ی نگاشت‌نشده **دور ریخته نمی‌شود**. «کرواسان تازه»
 * برای کاربر ارزش دارد، فقط چیزی نیست که رویش فیلتر بگذاری.
 */

import { normalizeFa, squashFa } from '@/core/text/normalize'
import type { AttributeValue, PlaceKind, PriceTier } from '@/core/places/types'
import { DISTRICTS } from '@/data/districts'

// ── محله ─────────────────────────────────────────────────────────────

/**
 * نام محله در فایل ورودی گاهی چند محله است («وکیل‌آباد / سجاد») و گاهی
 * املای متفاوت دارد («کوه‌سنگی» با نیم‌فاصله در برابر «کوهسنگی»).
 * نرمال‌سازی هر دو را حل می‌کند؛ برای چندتایی، اولی برنده است.
 */
export function mapArea(area: string): string | null {
  if (!area) return null

  // مقایسه با فاصله‌های حذف‌شده، تا «کوه‌سنگی» و «کوهسنگی» و «کوه سنگی»
  // هر سه یکی شمرده شوند.
  const parts = area.split('/').map((p) => squashFa(p)).filter(Boolean)

  for (const part of parts) {
    const exact = DISTRICTS.find((d) => squashFa(d.name) === part)
    if (exact) return exact.id
  }

  // تطابق جزئی — «امام خمینی» داخل «ارگ / امام خمینی»
  for (const part of parts) {
    const partial = DISTRICTS.find((d) => {
      const name = squashFa(d.name)
      return part.includes(name) || name.includes(part)
    })
    if (partial) return partial.id
  }

  return null
}

// ── بازه‌ی قیمت ──────────────────────────────────────────────────────

/**
 * «متوسط تا بالا» عمداً ۳ می‌شود نه ۲. اگر کاربر «اقتصادی» فیلتر کند و جایی
 * که ممکن است گران باشد ببیند، اعتمادش را از دست می‌دهد؛ برعکسش فقط یعنی
 * یک گزینه‌ی خوب را ندیده. خطای محافظه‌کارانه به سمت گران‌تر است.
 */
export function mapPriceRange(raw: string): PriceTier {
  const n = normalizeFa(raw)
  if (n.includes('اقتصادی') || n.includes('ارزان')) return 1
  if (n.includes('متوسط تا بالا')) return 3
  if (n.includes('بالا') || n.includes('لوکس') || n.includes('گران')) return 3
  return 2
}

// ── نوع مکان ─────────────────────────────────────────────────────────

export function mapCategory(category: string, signatureItem = ''): PlaceKind {
  const n = normalizeFa(`${category} ${signatureItem}`)

  const restaurantish = [
    'رستوران',
    'استیک',
    'برگر',
    'پاستا',
    'پیتزا',
    'کباب',
    'غذای',
    'فست فود',
    'سنتی',
  ]
  const hits = restaurantish.filter((w) => n.includes(normalizeFa(w))).length

  if (n.includes('رستوران')) return 'restaurant'
  if (hits > 0) return 'cafe_restaurant'
  return 'cafe'
}

// ── امکانات ──────────────────────────────────────────────────────────

/**
 * قواعد کلیدواژه‌ای، نه تطابق دقیق.
 *
 * با ۲۶۵ رشته‌ی یکتا، جدول تطابق دقیق روز اول کهنه می‌شود. کلیدواژه‌ها روی
 * رشته‌های *دیده‌نشده* هم کار می‌کنند — که مهم است، چون کافه‌ی بعدی که اضافه
 * می‌شود رشته‌ی جدید می‌آورد.
 *
 * `value` درجه‌بندی است: کلیدواژه‌ی صریح ۲ («بله»)، کلیدواژه‌ی ضمنی ۱
 * («تاحدی»). مثلاً «فضای باز محدود» → outdoor با درجه‌ی ۱ نه ۲.
 */
interface AmenityRule {
  attributeId: string
  /** هر کلیدواژه‌ای که بیاید، قاعده فعال می‌شود. */
  keywords: string[]
  /** کلیدواژه‌هایی که درجه را به «تاحدی» تنزل می‌دهند. */
  partialKeywords?: string[]
  value?: AttributeValue
}

const AMENITY_RULES: AmenityRule[] = [
  {
    attributeId: 'laptop_friendly',
    keywords: [
      'لپ تاپ', 'لپتاپ', 'جلسات کاری', 'جلسه کاری', 'مناسب کار', 'کار با',
      'میز کار', 'پرینتر', 'اسکنر', 'کنفرانس', 'کوورک',
    ],
  },
  { attributeId: 'fast_wifi', keywords: ['وای فای', 'وایفای', 'اینترنت'], partialKeywords: ['اینترنت'] },
  { attributeId: 'power_outlets', keywords: ['پریز'] },
  {
    attributeId: 'outdoor',
    keywords: ['روباز', 'رو باز', 'فضای باز', 'تراس', 'حیاط', 'بالکن', 'روف', 'بام', 'فضای سبز'],
    partialKeywords: ['محدود'],
  },
  { attributeId: 'parking', keywords: ['پارکینگ', 'پارک اختصاصی'] },
  { attributeId: 'quiet', keywords: ['آرام', 'خلوت', 'ساکت', 'بی سر و صدا'] },
  { attributeId: 'cozy', keywords: ['دنج', 'صمیمی', 'محیط گرم', 'نقلی'] },
  { attributeId: 'good_for_study', keywords: ['مطالعه', 'درس', 'دانشجو', 'کتاب'] },
  { attributeId: 'breakfast', keywords: ['صبحانه', 'صبحونه', 'برانچ', 'نان تازه', 'بیکری'] },
  {
    attributeId: 'family_friendly',
    keywords: ['خانوادگی', 'خانواده', 'کودک', 'بچه', 'جشن تولد'],
  },
  {
    attributeId: 'specialty_coffee',
    keywords: [
      'قهوه تخصصی', 'تخصصی', 'دمی', 'روست', 'باریستا', 'دم آوری',
      'موج سوم', 'اسپرسو', 'سینگل اورجین', 'v60', 'قهوه ترک', 'قهوه فرانسه',
    ],
  },
  {
    attributeId: 'natural_light',
    keywords: ['نور طبیعی', 'نورگیر', 'روشن', 'نور عالی', 'نورپردازی', 'نور ملایم'],
    partialKeywords: ['نورپردازی', 'نور ملایم'],
  },
  {
    attributeId: 'open_late',
    keywords: ['نیمه شب', 'دیروقت', 'شبانه', '24 ساعت', 'تا دیر'],
  },
  { attributeId: 'good_for_date', keywords: ['قرار', 'رمانتیک', 'دو نفره', 'عاشقانه'] },
  { attributeId: 'non_smoking', keywords: ['غیرسیگاری', 'غیر سیگاری', 'بدون دود'] },
  { attributeId: 'vip_room', keywords: ['vip', 'وی ای پی', 'تشریفات', 'سالن خصوصی'] },
  { attributeId: 'live_music', keywords: ['موسیقی زنده', 'اجرای زنده', 'کنسرت'] },
  { attributeId: 'boardgames', keywords: ['بردگیم', 'بازی رومیزی', 'مافیا'] },
  { attributeId: 'takeaway', keywords: ['بیرون بر', 'تیک اوی', 'express'] },
  { attributeId: 'sports_screening', keywords: ['مسابقات', 'فوتبال'] },
  { attributeId: 'lively', keywords: ['پرانرژی', 'جوانانه', 'شلوغ', 'پرجنب'] },
  { attributeId: 'quick_service', keywords: ['سرو سریع', 'سرو بسیار سریع', 'سرویس سریع'] },
  {
    attributeId: 'scenic_view',
    keywords: ['دید به شهر', 'پانوراما', 'دید کامل', 'منظره', 'دید ۳۶۰', 'دید 360', 'چشم انداز'],
  },
  {
    attributeId: 'upscale',
    keywords: ['لوکس', 'شیک', 'مجلل', 'تشریفات رسمی'],
  },
  {
    attributeId: 'photogenic',
    keywords: ['عکاسی', 'دیوارنگاری', 'مینیمال', 'دکور', 'طراحی مدرن', 'گل آرایی'],
  },
  {
    attributeId: 'desserts',
    keywords: [
      'کیک', 'دسر', 'شیرینی', 'تارت', 'چیزکیک', 'پاستری', 'وافل',
      'کرپ', 'بستنی', 'ژلاتو', 'کرواسان', 'براونی',
    ],
  },
  {
    attributeId: 'healthy_options',
    keywords: ['گیاهی', 'ارگانیک', 'رژیمی', 'وگان', 'کیک سالم', 'اسموتی'],
  },
]

export interface MappedAmenities {
  /** شناسه → درجه. قابل فیلتر. */
  attributes: Map<string, AttributeValue>
  /** رشته‌هایی که به هیچ شناسه‌ای نگاشت نشدند — فقط نمایش. */
  highlights: string[]
}

export function mapAmenities(amenities: string[]): MappedAmenities {
  const attributes = new Map<string, AttributeValue>()
  const highlights: string[] = []

  for (const raw of amenities) {
    const n = normalizeFa(raw)
    if (!n) continue

    let matched = false

    for (const rule of AMENITY_RULES) {
      const hit = rule.keywords.some((k) => n.includes(normalizeFa(k)))
      if (!hit) continue

      matched = true
      const downgraded = rule.partialKeywords?.some((k) => n.includes(normalizeFa(k)))
      const value: AttributeValue = downgraded ? 1 : (rule.value ?? 2)

      // اگر ویژگی از رشته‌ی دیگری هم آمده، بالاترین درجه برنده است.
      const existing = attributes.get(rule.attributeId) ?? 0
      if (value > existing) attributes.set(rule.attributeId, value)
    }

    // رشته‌ی نگاشت‌نشده دور ریخته نمی‌شود — به سطل نمایش می‌رود.
    if (!matched) highlights.push(raw.trim())
  }

  return { attributes, highlights }
}

// ── تلفن ─────────────────────────────────────────────────────────────

/**
 * اعتبارسنجی تلفن.
 *
 * ۱۰ رکورد در فایل ورودی تلفن خراب دارند — ۹ تای‌شان به «هم» ختم می‌شوند
 * («۰۵۱-۳۷۶۰۱۰هم») که ظاهراً حاصل یک find/replace خراب است، و یکی هم خیلی
 * کوتاه است.
 *
 * این‌ها **وارد نمی‌شوند**. نمایش شماره‌ی غلط بدتر از نبودِ شماره است: کاربر
 * زنگ می‌زند به یک غریبه و اعتمادش به کل سایت می‌ریزد.
 */
export function normalizePhone(raw: string | undefined): string | null {
  if (!raw) return null

  const digits = normalizeFa(raw).replace(/[^0-9]/g, '')
  if (digits.length < 10 || digits.length > 12) return null

  // هر حرفی غیر از رقم و جداکننده یعنی رکورد خراب است.
  if (/[^\d۰-۹٠-٩\s\-()+]/.test(raw)) return null

  return raw.trim()
}

// ── slug ─────────────────────────────────────────────────────────────

/**
 * slug از نام انگلیسی ساخته می‌شود نه فارسی.
 *
 * `/cafe/vien-cafe` هم در URL خواناست، هم موقع اشتراک‌گذاری در پیام‌رسان
 * نمی‌شکند. slug فارسی percent-encode می‌شود و به یک رشته‌ی نامفهوم
 * ۶۰ کاراکتری تبدیل می‌شود.
 */
export function makeSlug(nameEn: string, nameFa: string, fallbackId: number): string {
  const base = (nameEn || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')

  if (base) return base

  const fa = normalizeFa(nameFa).replace(/\s+/g, '-')
  return fa || `cafe-${fallbackId}`
}
