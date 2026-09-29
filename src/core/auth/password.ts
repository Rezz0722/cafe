import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

/**
 * هش و بررسی رمز عبور.
 *
 * ═══ چرا scrypt و نه sha256 ═══
 *
 * هش‌های عمومی (sha256، md5) عمداً **سریع**‌اند — که برای رمز عبور دقیقاً
 * چیز بدی است: مهاجمی که فایل کاربران را بدزدد، میلیاردها حدس در ثانیه
 * می‌زند. scrypt عمداً کند و حافظه‌بر است، پس حمله‌ی دیکشنری گران می‌شود.
 *
 * scrypt در `node:crypto` هست، پس هیچ وابستگی جدیدی لازم نیست (bcrypt نیاز
 * به build بومی دارد که روی ویندوز دردسر است).
 *
 * هر رمز salt یکتای خودش را دارد، پس دو کاربر با رمز یکسان، هش یکسان
 * ندارند — و rainbow table بی‌فایده می‌شود.
 *
 * قالب ذخیره:  scrypt$N$salt_hex$hash_hex
 */

/** پارامتر هزینه. بالاتر = امن‌تر و کندتر. ۱۶۳۸۴ پیش‌فرض معقول node است. */
const COST = 16_384
const KEY_LEN = 64
const SALT_LEN = 16
export const MAX_PASSWORD_LENGTH = 256

export function hashPassword(plain: string): string {
  if (!plain || plain.length > MAX_PASSWORD_LENGTH) throw new Error('طول رمز عبور نامعتبر است.')
  const salt = randomBytes(SALT_LEN)
  const hash = scryptSync(plain.normalize('NFKC'), salt, KEY_LEN, { N: COST })
  return `scrypt$${COST}$${salt.toString('hex')}$${hash.toString('hex')}`
}

/**
 * بررسی رمز. هرگز throw نمی‌کند — رکورد خراب یعنی «رمز غلط»، نه ۵۰۰.
 *
 * مقایسه زمان‌ثابت است: مقایسه‌ی معمولی رشته‌ها به‌محض اولین بایتِ متفاوت
 * برمی‌گردد، و مهاجم می‌تواند با سنجش زمان پاسخ، هش را بایت‌به‌بایت بسازد.
 */
export function verifyPassword(plain: string, stored: string | null | undefined): boolean {
  if (!plain || plain.length > MAX_PASSWORD_LENGTH || !stored) return false

  const parts = stored.split('$')
  if (parts.length !== 4 || parts[0] !== 'scrypt') return false

  const cost = Number(parts[1])
  if (!Number.isFinite(cost) || cost < 1024 || cost > 1_048_576) return false

  try {
    const salt = Buffer.from(parts[2], 'hex')
    const expected = Buffer.from(parts[3], 'hex')
    const actual = scryptSync(plain.normalize('NFKC'), salt, expected.length, { N: cost })
    return timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}

/**
 * رمز تصادفی خوانا برای حساب‌های اولیه.
 *
 * حروف مبهم (0/O، 1/l/I) حذف شده‌اند چون این رمزها دست‌به‌دست و گاهی از روی
 * کاغذ تایپ می‌شوند.
 */
const ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generatePassword(length = 16): string {
  const bytes = randomBytes(length)
  let out = ''
  for (let i = 0; i < length; i += 1) out += ALPHABET[bytes[i] % ALPHABET.length]
  return out
}

// ── محدودیت تلاش ─────────────────────────────────────────────────────

export const LOGIN_MAX_ATTEMPTS = 5
export const LOGIN_LOCKOUT_MIN = 15

/**
 * سیاست قفل ورود.
 *
 * از تنظیمات پنل ادمین می‌آید ولی پیش‌فرض دارد، تا این ماژول بدون دیتابیس
 * قابل تست بماند و اگر جدول تنظیمات در دسترس نبود، سقف تلاش **از بین نرود**.
 */
export interface LockoutPolicy {
  maxAttempts: number
  lockoutMinutes: number
}

export const DEFAULT_LOCKOUT: LockoutPolicy = {
  maxAttempts: LOGIN_MAX_ATTEMPTS,
  lockoutMinutes: LOGIN_LOCKOUT_MIN,
}

/**
 * رمز عبور برخلاف OTP منقضی نمی‌شود، پس brute-force روی آن ارزش دارد.
 * بدون این سقف، مهاجم بی‌نهایت حدس می‌زند.
 */
export function isLockedOut(
  failedAt: number[],
  now = Date.now(),
  policy: LockoutPolicy = DEFAULT_LOCKOUT,
): boolean {
  const windowStart = now - policy.lockoutMinutes * 60_000
  return failedAt.filter((t) => t > windowStart).length >= policy.maxAttempts
}

export function pruneFailed(
  failedAt: number[],
  now = Date.now(),
  policy: LockoutPolicy = DEFAULT_LOCKOUT,
): number[] {
  const windowStart = now - policy.lockoutMinutes * 60_000
  return failedAt.filter((t) => t > windowStart)
}
