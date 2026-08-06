/**
 * وضعیت فرم‌های پنل مدیریت.
 *
 * جدا از `actions.ts` چون یک ماژول `'use server'` فقط تابع async می‌تواند
 * export کند — یک `const` از آنجا در زمان build خطا می‌دهد.
 */

export interface AdminActionState {
  ok: boolean
  error?: string
  message?: string
  /**
   * اعتبارنامه‌ی تازه صادرشده.
   *
   * **تنها جایی که رمز دیده می‌شود.** فقط هشِ رمز ذخیره می‌شود، پس بعد از
   * بستن این پیام هیچ‌کس — از جمله ادمین — نمی‌تواند دوباره ببیندش. اگر گم
   * شد، رمز تازه صادر می‌شود.
   */
  credentials?: { username: string | null; password: string }
  /**
   * خطاهای فیلدی فرم تنظیمات — کلیدِ تنظیم به پیام.
   *
   * جدا از `error` است چون یک فرم تنظیمات ۱۵ فیلد دارد و نمایش «یکی از
   * فیلدها اشتباه است» بی‌فایده است؛ کاربر باید بداند کدام.
   */
  fieldErrors?: Record<string, string>
  /** کلیدهایی که ذخیره شدند — برای نشان‌دادن «همین‌ها عوض شد». */
  savedKeys?: string[]
}

export const EMPTY_ADMIN_STATE: AdminActionState = { ok: false }
