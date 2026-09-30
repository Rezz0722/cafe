/**
 * ثابت‌های OTP — بدون هیچ وابستگی به crypto.
 *
 * جدا از `otp.ts` چون صفحه‌ی ورود (کامپوننت کلاینت) به طول کد و مدت
 * شمارش معکوس نیاز دارد. اگر همان‌جا از `otp.ts` بخواند، `node:crypto`
 * وارد باندل مرورگر می‌شود و build می‌شکند — همان چیزی که این جداسازی
 * جلویش را می‌گیرد.
 */

export const OTP_LENGTH = 5
/** کد پس از یک دقیقه منقضی می‌شود؛ مقدار پنل نیز همین پیش‌فرض را می‌گیرد. */
export const OTP_TTL_SEC = 60
export const OTP_RESEND_COOLDOWN_SEC = 90
export const OTP_MAX_PER_HOUR = 5
export const OTP_MAX_ATTEMPTS = 5

/**
 * سقف کل ارسال در ساعت، روی همه‌ی شماره‌ها.
 *
 * سقف per-phone با عوض‌کردن شماره دور زده می‌شود: مهاجم با چند ده شماره کل
 * اعتبار پیامک را می‌سوزاند. این عدد را با اعتبار واقعی‌تان تنظیم کنید.
 */
export const OTP_MAX_GLOBAL_PER_HOUR = 60

/**
 * سیاست OTP به‌صورت یک شیء.
 *
 * ═══ چرا شیء و نه شش پارامتر ═══
 *
 * شش عدد پشت سر هم در امضای تابع، جای عوض‌کردنِ دو تای آن‌ها را خطای خاموش
 * می‌کند (`(5, 120)` و `(120, 5)` هر دو کامپایل می‌شوند). با شیء نام‌دار،
 * چنین اشتباهی خطای تایپ است.
 *
 * مقدارهای واقعی از تنظیمات پنل ادمین می‌آیند؛ این‌ها پیش‌فرض‌اند تا منطق
 * OTP بدون دیتابیس هم تست‌شدنی و امن بماند.
 */
export interface OtpPolicy {
  length: number
  ttlSeconds: number
  resendCooldownSeconds: number
  maxPerHour: number
  maxAttempts: number
  maxGlobalPerHour: number
}

export const DEFAULT_OTP_POLICY: OtpPolicy = {
  length: OTP_LENGTH,
  ttlSeconds: OTP_TTL_SEC,
  resendCooldownSeconds: OTP_RESEND_COOLDOWN_SEC,
  maxPerHour: OTP_MAX_PER_HOUR,
  maxAttempts: OTP_MAX_ATTEMPTS,
  maxGlobalPerHour: OTP_MAX_GLOBAL_PER_HOUR,
}
