import { createHash, randomInt, timingSafeEqual } from 'node:crypto'
import {
  OTP_LENGTH,
  OTP_MAX_ATTEMPTS,
  OTP_MAX_GLOBAL_PER_HOUR,
  OTP_MAX_PER_HOUR,
  OTP_RESEND_COOLDOWN_SEC,
  OTP_TTL_SEC,
} from './otpConfig'

export * from './otpConfig'

/**
 * منطق کد یک‌بارمصرف.
 *
 * ═══ چرا محدودیت نرخ اینجا حیاتی است ═══
 *
 * هر درخواست OTP پول واقعی خرج می‌کند. بدون محدودیت، یک اسکریپت ساده در
 * چند دقیقه کل اعتبار پیامک را می‌سوزاند — و این حمله‌ی نیازی به مهارت
 * ندارد، فقط یک حلقه‌ی curl است. محدودیت نرخ روی OTP اختیاری نیست.
 *
 * سه لایه:
 *   ۱. فاصله‌ی حداقلی بین دو درخواست برای یک شماره (۹۰ ثانیه)
 *   ۲. سقف درخواست در ساعت برای یک شماره (۵ بار)
 *   ۳. سقف تلاش غلط برای یک کد (۵ بار) — جلوی brute-force خود کد
 *
 * کد **هش‌شده** ذخیره می‌شود، نه خام. اگر فایل داده لو برود، کدهای فعال
 * قابل استفاده نیستند.
 *
 * این ماژول عمداً `server-only` نیست: هیچ رازی نمی‌خواند و منطق خالص است،
 * پس مستقیم قابل تست است. محافظت از کلیدها روی `config/env.ts` است.
 */


export interface OtpRecord {
  phone: string
  codeHash: string
  expiresAt: number
  attempts: number
  createdAt: number
  /** زمان درخواست‌های اخیر برای این شماره — برای سقف ساعتی. */
  recentRequests: number[]
}

export function generateCode(): string {
  // randomInt امن است؛ Math.random برای کد ورود قابل قبول نیست.
  const max = 10 ** OTP_LENGTH
  return String(randomInt(0, max)).padStart(OTP_LENGTH, '0')
}

export function hashCode(phone: string, code: string): string {
  // شماره در هش می‌آید تا یک کد برای شماره‌ی دیگر قابل استفاده نباشد.
  return createHash('sha256').update(`${phone}:${code}`).digest('hex')
}

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'))
}

export type RequestDecision =
  | { allowed: true; recentRequests: number[] }
  | { allowed: false; reason: string; retryAfterSec: number }

/** آیا اجازه‌ی ارسال کد جدید هست؟ */
export function canRequestCode(
  existing: OtpRecord | null,
  now = Date.now(),
): RequestDecision {
  const hourAgo = now - 3600_000
  const recent = (existing?.recentRequests ?? []).filter((t) => t > hourAgo)

  // لایه ۱ — فاصله‌ی بین دو درخواست
  if (existing && recent.length > 0) {
    const last = Math.max(...recent)
    const elapsed = (now - last) / 1000
    if (elapsed < OTP_RESEND_COOLDOWN_SEC) {
      const wait = Math.ceil(OTP_RESEND_COOLDOWN_SEC - elapsed)
      return {
        allowed: false,
        reason: `تا ارسال دوباره ${wait} ثانیه صبر کنید.`,
        retryAfterSec: wait,
      }
    }
  }

  // لایه ۲ — سقف ساعتی
  if (recent.length >= OTP_MAX_PER_HOUR) {
    const oldest = Math.min(...recent)
    const wait = Math.ceil((oldest + 3600_000 - now) / 1000)
    return {
      allowed: false,
      reason: 'تعداد درخواست‌ها زیاد بود. یک ساعت دیگر دوباره تلاش کنید.',
      retryAfterSec: Math.max(wait, 60),
    }
  }

  return { allowed: true, recentRequests: [...recent, now] }
}

export function createOtpRecord(
  phone: string,
  code: string,
  recentRequests: number[],
  now = Date.now(),
): OtpRecord {
  return {
    phone,
    codeHash: hashCode(phone, code),
    expiresAt: now + OTP_TTL_SEC * 1000,
    attempts: 0,
    createdAt: now,
    recentRequests,
  }
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: string; burned: boolean }

/**
 * کد را بررسی می‌کند.
 *
 * `burned: true` یعنی رکورد باید حذف شود — یا مصرف شده یا سوخته.
 */
export function verifyCode(
  record: OtpRecord | null,
  phone: string,
  code: string,
  now = Date.now(),
): VerifyResult {
  if (!record) {
    return { ok: false, reason: 'کدی برای این شماره درخواست نشده.', burned: false }
  }

  if (record.expiresAt < now) {
    return { ok: false, reason: 'کد منقضی شده. کد جدید بگیرید.', burned: true }
  }

  if (record.attempts >= OTP_MAX_ATTEMPTS) {
    return {
      ok: false,
      reason: 'تعداد تلاش‌های ناموفق زیاد بود. کد جدید بگیرید.',
      burned: true,
    }
  }

  const given = hashCode(phone, code.replace(/\D/g, ''))
  if (!safeEqualHex(given, record.codeHash)) {
    const left = OTP_MAX_ATTEMPTS - record.attempts - 1
    return {
      ok: false,
      reason: left > 0 ? `کد اشتباه است. ${left} تلاش باقی مانده.` : 'کد اشتباه است.',
      burned: left <= 0,
    }
  }

  return { ok: true }
}

// ── سقف سراسری ───────────────────────────────────────────────────────


export function isGlobalLimitReached(
  globalRequests: number[],
  now = Date.now(),
): boolean {
  const hourAgo = now - 3600_000
  return globalRequests.filter((t) => t > hourAgo).length >= OTP_MAX_GLOBAL_PER_HOUR
}

export function pruneGlobal(globalRequests: number[], now = Date.now()): number[] {
  const hourAgo = now - 3600_000
  return globalRequests.filter((t) => t > hourAgo)
}
