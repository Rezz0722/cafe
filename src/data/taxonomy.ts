import type { PriceKey, SortKey, VenueType } from '@/types'

/** Intent tags, in the order they appear as filter chips. */
export const INTENTS = [
  'مناسب کار با لپ‌تاپ',
  'مناسب قرار',
  'فضای باز',
  'دنج',
  'مناسب مطالعه',
  'صبحانه',
] as const

/** Mashhad neighbourhoods covered by the guide. */
export const HOODS = [
  'سجاد',
  'احمدآباد',
  'کوهسنگی',
  'وکیل‌آباد',
  'راهنمایی',
  'قاسم‌آباد',
] as const

export const PRICE_LABELS: Record<PriceKey, string> = {
  cheap: 'اقتصادی',
  mid: 'متوسط',
  high: 'گران',
}

export const PRICE_OPTIONS: { key: PriceKey | ''; label: string }[] = [
  { key: '', label: 'همه' },
  { key: 'cheap', label: PRICE_LABELS.cheap },
  { key: 'mid', label: PRICE_LABELS.mid },
  { key: 'high', label: PRICE_LABELS.high },
]

export const TYPE_OPTIONS: { key: VenueType | ''; label: string }[] = [
  { key: '', label: 'همه' },
  { key: 'کافه', label: 'کافه' },
  { key: 'کافه‌رستوران', label: 'کافه‌رستوران' },
]

export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'rating', label: 'بیشترین امتیاز' },
  { key: 'near', label: 'نزدیک‌ترین' },
  { key: 'popular', label: 'محبوب‌ترین' },
]

/** Persian weekdays, Saturday first — the order Iranian calendars use. */
export const WEEKDAYS = [
  'شنبه',
  'یک‌شنبه',
  'دوشنبه',
  'سه‌شنبه',
  'چهارشنبه',
  'پنج‌شنبه',
  'جمعه',
] as const

/**
 * Index into `WEEKDAYS` for today. `Date#getDay` is Sunday-based, so shifting by
 * one lands on the Saturday-based Persian week.
 */
export function todayIndex(now: Date = new Date()): number {
  return (now.getDay() + 1) % 7
}

/** Opening-time options for the admin hours editor: 06:00 → 02:00 in 30m steps. */
export const TIME_OPTIONS: string[] = (() => {
  const faDigit = (s: string) => s.replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)])
  const out: string[] = []
  for (let h = 6; h <= 24; h += 1) {
    out.push(`${faDigit(String(h).padStart(2, '0'))}:۰۰`)
    if (h < 24) out.push(`${faDigit(String(h).padStart(2, '0'))}:۳۰`)
  }
  out.push('۰۱:۰۰', '۰۲:۰۰')
  return out
})()

/** Tags a venue owner can apply to their own listing from the admin panel. */
export const OWNER_TAGS = [
  'مناسب کار',
  'مناسب قرار',
  'فضای باز',
  'دنج',
  'مناسب مطالعه',
  'صبحانه',
  'باز تا نیمه‌شب',
  'مناسب خانواده',
] as const
