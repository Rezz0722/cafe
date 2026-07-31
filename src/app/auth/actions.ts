'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { normalizePhone } from '@/core/auth/phone'
import {
  canRequestCode,
  createOtpRecord,
  generateCode,
  isGlobalLimitReached,
  pruneGlobal,
  verifyCode,
} from '@/core/auth/otp'
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SEC,
  createSessionToken,
} from '@/core/auth/session'
import { sendVerificationCode } from '@/core/sms/smsir'
import { isLockedOut, pruneFailed, verifyPassword } from '@/core/auth/password'
import {
  bumpOtpAttempts,
  clearFailedLogins,
  deleteOtp,
  findOrCreateUser,
  findUserByPhone,
  recordFailedLogin,
  getGlobalOtpRequests,
  getOtp,
  recordGlobalOtpRequest,
  saveOtp,
  updateUser,
} from '@/data/userStore'
import { getCurrentUser } from '@/core/auth/currentUser'
import { SESSION_SECRET } from '@/core/config/env'
import type { PasswordLoginState, RequestCodeState, VerifyCodeState } from './state'

/**
 * اکشن‌های احراز هویت.
 *
 * قاعده‌ی امنیتی در کل این فایل: **پیام خطا نباید بگوید کاربر وجود دارد یا
 * نه.** «کد فرستاده شد» برای شماره‌ی ثبت‌نشده هم همان است — وگرنه این
 * endpoint تبدیل می‌شود به ابزار فهرست‌برداری از شماره‌های ثبت‌شده.
 */

function str(form: FormData, key: string): string {
  const v = form.get(key)
  return typeof v === 'string' ? v.trim() : ''
}

// ── گام ۱: درخواست کد ────────────────────────────────────────────────

export async function requestCodeAction(
  _prev: RequestCodeState,
  form: FormData,
): Promise<RequestCodeState> {
  if (!SESSION_SECRET) {
    return { ok: false, error: 'سرویس ورود تنظیم نشده است. (SESSION_SECRET)' }
  }

  const phone = normalizePhone(str(form, 'phone'))
  if (!phone) {
    return { ok: false, error: 'شماره موبایل معتبر نیست. مثال: ۰۹۱۵۱۲۳۴۵۶۷' }
  }

  const existing = await getOtp(phone)
  const decision = canRequestCode(existing)
  if (!decision.allowed) {
    return { ok: false, error: decision.reason, retryAfterSec: decision.retryAfterSec }
  }

  /**
   * سقف سراسری — لایه‌ای که سقف per-phone نمی‌پوشاند.
   *
   * مهاجم می‌تواند شماره عوض کند و سهمیه‌ی تازه بگیرد؛ این بند جلوی
   * سوزاندن کل اعتبار پیامک با چند ده شماره را می‌گیرد.
   */
  const globalRequests = pruneGlobal(await getGlobalOtpRequests())
  if (isGlobalLimitReached(globalRequests)) {
    console.warn('[auth] global OTP rate limit hit — possible abuse')
    return {
      ok: false,
      error: 'سرویس ورود موقتاً شلوغ است. چند دقیقه بعد دوباره تلاش کنید.',
    }
  }

  const code = generateCode()
  const sent = await sendVerificationCode(phone, code)

  if (!sent.ok) {
    // لاگ سرور جزئیات را دارد؛ کاربر فقط پیام عمومی می‌بیند.
    console.error('[auth] SMS send failed', sent.detail ?? sent.error)
    return { ok: false, error: sent.error ?? 'ارسال پیامک ناموفق بود.' }
  }

  await saveOtp(createOtpRecord(phone, code, decision.recentRequests))
  await recordGlobalOtpRequest(globalRequests)

  return { ok: true, phone, devMode: sent.method === 'dev' }
}

// ── گام ۲: تأیید کد ──────────────────────────────────────────────────

export async function verifyCodeAction(
  _prev: VerifyCodeState,
  form: FormData,
): Promise<VerifyCodeState> {
  const phone = normalizePhone(str(form, 'phone'))
  const code = str(form, 'code').replace(/\D/g, '')

  if (!phone) return { ok: false, error: 'شماره نامعتبر است.' }
  if (!code) return { ok: false, error: 'کد را وارد کنید.' }

  const record = await getOtp(phone)
  const result = verifyCode(record, phone, code)

  if (!result.ok) {
    if (result.burned) await deleteOtp(phone)
    else await bumpOtpAttempts(phone)
    return { ok: false, error: result.reason }
  }

  // کد مصرف شد — بلافاصله بسوزانش تا دوبار قابل استفاده نباشد.
  await deleteOtp(phone)

  const user = await findOrCreateUser(phone)
  if (user.blocked) {
    return { ok: false, error: 'دسترسی این حساب مسدود شده است.' }
  }

  const token = createSessionToken({
    userId: user.id,
    phone: user.phone,
    role: user.role,
  })

  const store = await cookies()
  store.set(SESSION_COOKIE, token, {
    httpOnly: true, // جاوااسکریپت نمی‌بیندش — XSS نمی‌تواند بدزددش
    sameSite: 'lax', // جلوی CSRF پایه
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE_SEC,
  })

  revalidatePath('/', 'layout')

  return {
    ok: true,
    needsName: !user.name,
    role: user.role,
  }
}

// ── ورود با رمز عبور ─────────────────────────────────────────────────

/**
 * ورود با رمز — مسیر دوم، نه جایگزین کد پیامکی.
 *
 * ═══ چرا لازم است ═══
 *
 * ورود فقط با پیامک یک نقطه‌ی شکست تک‌نقطه‌ای می‌سازد: اعتبار پیامک که تمام
 * شود، سرویس که قطع شود، یا شماره که در دسترس نباشد، مدیر از پنل خودش
 * بیرون می‌ماند و راهی برای برگشتن ندارد.
 *
 * رمز فقط برای حساب‌هایی فعال است که `passwordHash` دارند — کاربر عادی
 * همچنان فقط با کد پیامکی وارد می‌شود و رمزی ندارد که لو برود.
 */
export async function passwordLoginAction(
  _prev: PasswordLoginState,
  form: FormData,
): Promise<PasswordLoginState> {
  if (!SESSION_SECRET) {
    return { ok: false, error: 'سرویس ورود تنظیم نشده است. (SESSION_SECRET)' }
  }

  const phone = normalizePhone(str(form, 'phone'))
  const password = str(form, 'password')

  /*
    یک پیام برای همه‌ی حالت‌های شکست: کاربر ناموجود، بدون رمز، رمز غلط.
    پیام‌های متفاوت، این فرم را به ابزار فهرست‌برداری تبدیل می‌کند —
    مهاجم می‌فهمد کدام شماره ثبت شده و کدام رمز دارد.
  */
  const GENERIC = 'شماره یا رمز عبور درست نیست.'

  if (!phone || !password) return { ok: false, error: GENERIC }

  const user = await findUserByPhone(phone)
  if (!user || !user.passwordHash || user.blocked) {
    return { ok: false, error: GENERIC }
  }

  // رمز عبور منقضی نمی‌شود، پس brute-force رویش ارزش دارد.
  const failed = pruneFailed(user.failedLogins ?? [])
  if (isLockedOut(failed)) {
    return {
      ok: false,
      error: 'تعداد تلاش‌های ناموفق زیاد بود. ۱۵ دقیقه دیگر دوباره تلاش کنید.',
    }
  }

  if (!verifyPassword(password, user.passwordHash)) {
    await recordFailedLogin(user.id, failed)
    return { ok: false, error: GENERIC }
  }

  await clearFailedLogins(user.id)

  const store = await cookies()
  store.set(
    SESSION_COOKIE,
    createSessionToken({ userId: user.id, phone: user.phone, role: user.role }),
    {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: SESSION_MAX_AGE_SEC,
    },
  )

  revalidatePath('/', 'layout')
  return { ok: true, role: user.role }
}

// ── تکمیل نام ────────────────────────────────────────────────────────

export async function setNameAction(
  _prev: { ok: boolean; error?: string },
  form: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'ابتدا وارد شوید.' }

  const name = str(form, 'name').slice(0, 60)
  if (!name) return { ok: false, error: 'نام را وارد کنید.' }

  await updateUser(user.id, { name })
  revalidatePath('/', 'layout')
  return { ok: true }
}

// ── خروج ─────────────────────────────────────────────────────────────

export async function signOutAction(): Promise<void> {
  const store = await cookies()
  store.delete(SESSION_COOKIE)
  revalidatePath('/', 'layout')
}
