/** محاسبهٔ تومان بدون دست‌کاری قیمت پایه. */
export function discountedPrice(price: number | null, percent: number): number | null {
  if (price === null) return null
  if (!Number.isInteger(percent) || percent < 1 || percent > 90) return price
  return Math.max(0, Math.round(price * (100 - percent) / 100))
}

/** datetime-local پنل همیشه به وقت ایران تفسیر می‌شود، مستقل از TZ سرور. */
export function parseDiscountExpiry(raw: string, now = new Date()): Date {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) throw new Error('تاریخ پایان را کامل وارد کنید.')
  const date = new Date(`${raw}:00+03:30`)
  if(Number.isFinite(date.getTime()) && new Date(date.getTime()+210*60000).toISOString().slice(0,16)!==raw) throw new Error('تاریخ پایان معتبر نیست.')
  if (!Number.isFinite(date.getTime()) || date <= now || date.getTime() > now.getTime() + 366 * 86400000) throw new Error('پایان تخفیف باید در آینده و حداکثر یک سال دیگر باشد.')
  return date
}
