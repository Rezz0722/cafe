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

/** آنچه یک نشست می‌تواند ببیند: اپ مشتری، یا پنل مالک کافه. */
export type Role = 'customer' | 'owner'

export interface User {
  name: string
  role: Role
  /** وقتی نشست از یک حساب دمو آمده باشد (data/devAccounts.ts). */
  username?: string
  /** کافه‌ای که این مالک مدیریت می‌کند. برای مشتری بی‌استفاده است. */
  venue?: string
}

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
