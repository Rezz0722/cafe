/**
 * تایپ‌های سطح اپلیکیشن.
 *
 * مدل دامنه به `src/core/places/types.ts` منتقل شد — آنجا مرجع است. اینجا
 * فقط چیزهایی می‌مانند که به UI و نشست مربوط‌اند و بخشی از دامنه نیستند.
 */

export type {
  Place,
  PlaceView,
  PlaceKind,
  PlaceStatus,
  PriceTier,
  MenuItem,
  MenuSection,
  Review,
  OpeningHour,
  District,
  Coords,
} from '@/core/places/types'

/*
 * `Role` و `User` از اینجا برداشته شدند.
 *
 * مدل نشست به `src/core/auth/types.ts` رفت — آنجا `Role` سه مقدار دارد
 * (customer/owner/admin) و مالکیت با فهرست slug ثبت می‌شود. نگه‌داشتن یک
 * `Role` دومِ دو‌مقداری اینجا یعنی دو تعریف متناقض از «نقش» در یک پروژه؛
 * دیر یا زود یکی import اشتباه می‌شود و ادمین بی‌صدا از فیلتر می‌افتد.
 */

/** برچسب فارسی بازه‌ی قیمت. */
export const PRICE_TIER_LABELS: Record<number, string> = {
  1: 'اقتصادی',
  2: 'متوسط',
  3: 'گران',
}

/** برچسب فارسی نوع مکان. */
export const PLACE_KIND_LABELS: Record<string, string> = {
  cafe: 'کافه',
  cafe_restaurant: 'کافه‌رستوران',
  restaurant: 'رستوران',
}
