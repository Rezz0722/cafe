const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹'

/** Convert every ASCII digit in `value` to its Persian counterpart. */
export function fa(value: string | number): string {
  return String(value).replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)])
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
