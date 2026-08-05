const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹'

/** Convert every ASCII digit in `value` to its Persian counterpart. */
export function fa(value: string | number): string {
  return String(value).replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)])
}

/**
 * Count with a Persian thousands mark — «۱۹٬۳۸۶».
 *
 * `fa` alone only swaps digits, so `fa(19386)` gives «۱۹۳۸۶»: readable, but a
 * five-digit run is hard to scan. Counts shown to users go through this.
 */
export function faCount(value: number): string {
  return fa(value.toLocaleString('en-US')).replace(/,/g, '٬')
}

/** Inverse of `fa` — Persian digits back to ASCII, other characters untouched. */
export function toEnDigits(value: string): string {
  return String(value).replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)))
}

/** Parse a possibly-Persian numeric string, ignoring separators. NaN if empty. */
export function parseNumber(value: string | number): number {
  const digits = toEnDigits(String(value)).replace(/[^0-9]/g, '')
  return digits === '' ? Number.NaN : Number.parseInt(digits, 10)
}

/** Format a toman amount with Persian digits and the Persian thousands mark. */
export function toman(amount: number): string {
  return `${fa(amount.toLocaleString('en-US')).replace(/,/g, '٬')} تومان`
}

/** A rating like 4.8 rendered as «۴٫۸» with the Persian decimal separator. */
export function faDecimal(value: number): string {
  return fa(String(value)).replace('.', '٫')
}

/** Percentage with the Persian percent sign, e.g. 20 → «۲۰٪». */
export function faPercent(value: number): string {
  return `${fa(value)}٪`
}

/**
 * Price after `discount` percent off, rounded to the nearest 1,000 toman the
 * way the venues actually price things.
 */
export function discountedPrice(price: number, discount?: number | null): number {
  if (!discount || discount <= 0) return price
  return Math.round((price * (100 - discount)) / 100 / 1000) * 1000
}

/**
 * تاریخ ISO → متن نسبی فارسی («۳ روز پیش»).
 *
 * در مدل قدیمی، `Review.date` خودش رشته‌ی «۳ روز پیش» بود — یعنی نه قابل
 * مرتب‌سازی، نه قابل کهنه‌شدن. حالا تاریخ واقعی ذخیره می‌شود و این تابع فقط
 * لایه‌ی نمایش است.
 */
export function relativeFa(iso: string, now: Date = new Date()): string {
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return ''

  const seconds = Math.max(0, (now.getTime() - then) / 1000)
  const minutes = seconds / 60
  const hours = minutes / 60
  const days = hours / 24

  if (minutes < 1) return 'همین الان'
  if (minutes < 60) return `${fa(Math.round(minutes))} دقیقه پیش`
  if (hours < 24) return `${fa(Math.round(hours))} ساعت پیش`
  if (days < 30) return `${fa(Math.round(days))} روز پیش`
  if (days < 365) return `${fa(Math.round(days / 30))} ماه پیش`
  return `${fa(Math.round(days / 365))} سال پیش`
}

/** «۰۹:۰۰» با ارقام فارسی، برای نمایش ساعت کاری. */
export function faTime(hhmm: string): string {
  return fa(hhmm)
}
