/** مقایسهٔ شماره‌نسخهٔ افزایشی فرم؛ ارقام اضافی/اعشاری پذیرفته نمی‌شوند. */
export function samePlaceRevision(current: number, submitted: string): boolean {
  if (!/^\d+$/.test(submitted)) return false
  const expected = Number(submitted)
  return Number.isSafeInteger(expected) && expected === current
}
