/**
 * امتیاز کیفیت و تازگی داده.
 *
 * دو عدد جدا، عمداً — چون دو چیز متفاوت را می‌سنجند و درمان‌هایشان فرق دارد:
 *
 *   qualityScore   چقدر از پروفایل پر شده؟          → درمان: جمع‌آوری داده
 *   freshnessScore چقدر از آخرین تأیید گذشته؟       → درمان: بازدید دوباره
 *
 * ادغام این دو در یک عدد، صف کار تیم داده را غیرقابل‌استفاده می‌کند: نمی‌شود
 * فهمید «کافه‌ی ناقص» یا «کافه‌ی بیات» جلوی روی توست.
 */

import type { Place } from '@/core/places/types'

/** وزن هر فیلد در کامل‌بودن پروفایل. جمعشان لازم نیست ۱۰۰ باشد. */
const COMPLETENESS_WEIGHTS = {
  coords: 20, // بدون مختصات، مکان روی نقشه و در سورت فاصله نیست
  hours: 18, // پرتکرارترین سؤال کاربر
  photos: 14,
  attributes: 14, // همان چیزی که محصول را از گوگل‌مپ متمایز می‌کند
  address: 10,
  phone: 8,
  menu: 8,
  description: 4,
  instagram: 4,
} as const

/** حداقل تعداد ویژگی برای گرفتن امتیاز کامل آن بخش. */
const ATTRIBUTE_TARGET = 6
const PHOTO_TARGET = 3

/** ۰..۱۰۰ — چقدر از پروفایل پر است. */
export function computeQualityScore(place: Place): number {
  let score = 0
  const w = COMPLETENESS_WEIGHTS

  if (place.coords) score += w.coords
  if (place.hours.some((h) => !h.closed)) score += w.hours
  if (place.address?.trim()) score += w.address
  if (place.phone?.trim()) score += w.phone
  if (place.instagram?.trim()) score += w.instagram
  if (place.description?.trim()) score += w.description
  if (place.menu.some((s) => s.items.length > 0)) score += w.menu

  score += Math.min(place.photos.length / PHOTO_TARGET, 1) * w.photos
  score += Math.min(place.attributes.length / ATTRIBUTE_TARGET, 1) * w.attributes

  return Math.round(Math.min(score, 100))
}

/**
 * نیمه‌عمر تازگی، بر حسب روز — هر فیلد نرخ بیات‌شدن خودش را دارد.
 * ساعت کاری بعد از سه ماه مشکوک است؛ آدرس بعد از دو سال هم احتمالاً درست است.
 */
const FIELD_HALF_LIFE_DAYS: Record<string, number> = {
  hours: 90,
  menu: 60, // با تورم، قیمت منو سریع‌ترین چیزی است که غلط می‌شود
  phone: 365,
  address: 730,
  attributes: 180,
}

const DEFAULT_HALF_LIFE_DAYS = 180

function daysSince(iso: string | null, now: Date): number {
  if (!iso) return Number.POSITIVE_INFINITY
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return Number.POSITIVE_INFINITY
  return (now.getTime() - then) / 86_400_000
}

/**
 * ۰..۱۰۰ — چقدر داده تازه است. افت نمایی بر اساس نیمه‌عمر هر فیلد.
 * فیلدی که هرگز تأیید نشده صفر می‌گیرد، نه اینکه نادیده گرفته شود.
 */
export function computeFreshnessScore(place: Place, now: Date = new Date()): number {
  const fields = Object.keys(FIELD_HALF_LIFE_DAYS)

  const scores = fields.map((field) => {
    const record = place.provenance.find((p) => p.field === field)
    const age = daysSince(record?.observedAt ?? place.lastVerifiedAt, now)
    if (!Number.isFinite(age)) return 0

    const halfLife = FIELD_HALF_LIFE_DAYS[field] ?? DEFAULT_HALF_LIFE_DAYS
    return 100 * Math.pow(0.5, age / halfLife)
  })

  const total = scores.reduce((sum, s) => sum + s, 0)
  return Math.round(total / scores.length)
}

/** آیا قیمت منو آن‌قدر کهنه است که نمایشش گمراه‌کننده باشد؟ */
export function isMenuPriceStale(priceUpdatedAt: string | null, now: Date = new Date()): boolean {
  return daysSince(priceUpdatedAt, now) > 120
}

/** برچسب فارسی برای «آخرین بررسی» — یک قابلیت دیدنی، نه فقط متادیتای داخلی. */
export function verificationLabel(iso: string | null, now: Date = new Date()): string {
  const days = daysSince(iso, now)
  if (!Number.isFinite(days)) return 'هنوز تأیید نشده'
  if (days < 1) return 'امروز بررسی شده'
  if (days < 30) return `${Math.round(days)} روز پیش بررسی شده`
  if (days < 365) return `${Math.round(days / 30)} ماه پیش بررسی شده`
  return 'بیش از یک سال پیش بررسی شده'
}
