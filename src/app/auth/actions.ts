'use server'

import { randomUUID } from 'node:crypto'
import { withDbNamedLock } from '@/db/client'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { headers } from 'next/headers'
import { getSession } from '@/core/auth/currentUser'
import { stopViewAs, VIEW_AS_READONLY } from '@/core/auth/impersonation'
import {
  canRequestCode,
  generateCode,
  hashCode,
  isGlobalLimitReached,
  pruneGlobal,
  type OtpRecord,
} from '@/core/auth/otp'
import { hashPassword, MAX_PASSWORD_LENGTH, verifyPassword } from '@/core/auth/password'
import { normalizePhone } from '@/core/auth/phone'
import { createSessionToken, SESSION_COOKIE } from '@/core/auth/session'
import {
  clearFailedLogins,
  createAuthSession,
  createUser,
  deactivateUser,
  findUserByLogin,
  findUserById,
  findUserByPhone,
  getActiveOtp,
  getLockState,
  isUsernameTaken,
  listRecentOtpTimes,
  listRecentOtpTimesGlobal,
  markPhoneVerified,
  revokeAllSessions,
  revokeSession,
  recordFailedLogin,
  saveOtp,
  setCredentials,
  updateUser,
  type SessionMethod,
  type OtpPurpose,
  isUnregisteredPhoneAccount,
} from '@/core/auth/userRepo'
import { SESSION_SECRET } from '@/core/config/env'
import { verifyStoredOtp } from '@/core/auth/otpVerification'
import { bindOtpBrowser, readOtpBrowser, bindRegistrationProof, readRegistrationProof, REGISTRATION_PROOF_COOKIE } from '@/core/auth/otpBrowser'
import { toAsciiDigits } from '@/core/text/normalize'
import { safeAuthRedirect, withAuthRedirect } from '@/core/auth/redirect'
import { paths } from '@/routes'
import { getAuthPolicy } from '@/core/settings/policies'
import { sendVerificationCode } from '@/core/sms/smsir'
import { cleanUserText } from '@/core/security/input'
import type {
  ChangePasswordState,
  PasswordLoginState,
  RegisterState,
  RequestCodeState,
  ResetPasswordState,
  VerifyCodeState,
} from './state'

/**
 * اکشن‌های احراز هویت.
 *
 * ورود پیامکی فقط برای کاربر موجود است. ساخت حساب مسیر مستقل ثبت‌نام دارد و
 * هرگز نباید تأیید کدِ فرم ورود باعث ساخت خودکار حساب یا ایجاد نشست شود.
 *
 * ═══ قاعده‌ی امنیتی در کل فایل ═══
 *
 * شکستِ ورود با رمز و پاسخ بازیابی برای حساب‌های ناموجود و نامعتبر یکسان
 * است. انتخاب مسیر ورود/ثبت‌نام، کاربر را به فرم مناسب حساب کامل یا ناقص
 * می‌برد؛ درخواست ثبت‌نامِ حساب کامل نباید اعتبار پیامک مصرف کند.
 */

function str(form: FormData, key: string): string {
  const value = form.get(key)
  return typeof value === 'string' ? value.trim() : ''
}

/** Navigation after a cookie write must not depend on a client component that
 * the action's layout revalidation can replace. Validate the destination here. */
function finishAuth(form: FormData, mustChangePassword = false): void {
  if (!form.has('redirectTo')) return // Compatibility with an already-open old form.
  const destination = safeAuthRedirect(str(form, 'redirectTo'))
  const target = mustChangePassword ? withAuthRedirect(paths.changePassword, destination) : destination
  // The App Router's server-action redirect can discard a destination hash.
  // Finish on a small authenticated page that performs a browser navigation,
  // preserving #reviews and replacing the cached anonymous page/layout.
  redirect(`/auth/complete?redirect=${encodeURIComponent(target)}`)
}

const COOKIE_BASE = {
  httpOnly: true, // جاوااسکریپت نمی‌بیندش — XSS نمی‌تواند بدزددش
  sameSite: 'lax' as const, // جلوی CSRF پایه
  // سرور preview روی IP و HTTP است. این escape hatch فقط در همان process
  // فعال می‌شود؛ سایت اصلی HTTPS همچنان همیشه کوکی Secure می‌گیرد.
  secure:
    process.env.NODE_ENV === 'production' &&
    process.env.ALLOW_INSECURE_SESSION_COOKIE !== '1',
  path: '/',
}

/**
 * مدت نشست از تنظیمات پنل ادمین می‌آید و در **دو جا** اعمال می‌شود: انقضای
 * داخل توکن امضاشده و `maxAge` کوکی. اگر فقط یکی عوض شود، یا کوکی زودتر
 * می‌رود (کاربر بی‌دلیل بیرون می‌افتد) یا توکنِ منقضی در مرورگر می‌ماند و هر
 * درخواست یک بار اضافه رد می‌شود.
 */
async function startSession(
  user: { id: string; phone: string; role: 'customer' | 'owner' | 'admin' },
  maxAgeSec: number,
  method: SessionMethod,
): Promise<void> {
  const requestHeaders = await headers()
  const forwarded = requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim()
  const expiresAt = new Date(Date.now() + maxAgeSec * 1000)
  const sessionId = await createAuthSession({
    userId: user.id,
    method,
    expiresAt,
    ip: forwarded || requestHeaders.get('x-real-ip'),
    userAgent: requestHeaders.get('user-agent'),
  })
  const store = await cookies()
  store.set(
    SESSION_COOKIE,
    createSessionToken({ sessionId, userId: user.id, phone: user.phone, role: user.role }, maxAgeSec),
    { ...COOKIE_BASE, maxAge: maxAgeSec },
  )
  revalidatePath('/', 'layout')
}

/** یک ساعت — پنجره‌ی سقف درخواست کد. */
const HOUR_SEC = 3600

// ═══════════════════════════════════════════════════════════════════════
// کد پیامکیِ هدف‌دار: ورود/ثبت‌نام یکپارچه، ثبت‌نام رمزی و بازیابی
// ═══════════════════════════════════════════════════════════════════════

async function requestPurposeCode(
  phone: string,
  purpose: OtpPurpose,
): Promise<RequestCodeState> {
  const result = await withDbNamedLock(`otp:${hashCode(phone, 'issuance')}`, () => issuePurposeCode(phone, purpose))
  return result.acquired ? result.value : { ok: false, error: 'درخواست ارسال کد در حال انجام است. چند لحظه صبر کنید.' }
}

async function issuePurposeCode(
  phone: string,
  purpose: OtpPurpose,
): Promise<RequestCodeState> {
  const requestId = randomUUID()
  const trace = (outcome: string, extra: Record<string, unknown> = {}) => {
    // Trace metadata excludes full phone numbers, credentials, and codes.
    console.info('[auth:otp]', JSON.stringify({ requestId, purpose, phoneSuffix: phone.slice(-4), outcome, at: new Date().toISOString(), ...extra }))
  }
  trace('received')
  // Check under the issuance lock, before rate limits or the SMS provider.
  // Legacy incomplete phone accounts still need to finish registration.
  if (purpose === 'verify_phone') {
    const account = await findUserByPhone(phone)
    if (account && !isUnregisteredPhoneAccount(account)) {
      trace('skipped', { reason: 'login-required' })
      return { ok: false, needsLogin: true }
    }
  }
  if (!SESSION_SECRET) {
    trace('blocked', { reason: 'session-config' })
    return { ok: false, error: 'سرویس ورود تنظیم نشده است. (SESSION_SECRET)' }
  }

  const policy = await getAuthPolicy()
  const storeChallenge = async (code: string, devMode = false): Promise<RequestCodeState> => {
    const challenge = await saveOtp({ phone, codeHash: hashCode(phone, code), ttlSec: policy.otp.ttlSeconds, purpose })
    await bindOtpBrowser(challenge)
    trace('code-stored', { challengeId: challenge.id, createdAt: challenge.createdAt.toISOString(), expiresAt: challenge.expiresAt.toISOString() })
    return { ok: true, phone, devMode, challengeId: challenge.id, serverNow: Date.now(), expiresAt: challenge.expiresAt.getTime(), resendAt: challenge.createdAt.getTime() + policy.otp.resendCooldownSeconds * 1000 }
  }
  if (purpose === 'login' ? !policy.allowOtpLogin : !policy.allowSmsVerification) {
    trace('blocked', { reason: 'sms-disabled' })
    return {
      ok: false,
      error: purpose === 'login'
        ? 'ورود پیامکی موقتاً غیرفعال است؛ با رمز عبور وارد شوید.'
        : 'ارسال کد تأیید موقتاً غیرفعال است.',
    }
  }

  /*
    منطق محدودیت نرخ در `otp.ts` است و تست دارد. اینجا فقط ورودی‌اش از
    دیتابیس ساخته می‌شود: رکورد فعلی به‌علاوه‌ی زمان درخواست‌های اخیر.
    بازنویسی آن منطق روی SQL یعنی دو پیاده‌سازی از یک قاعده.
  */
  const active = await getActiveOtp(phone, purpose)
  const recentRequests = await listRecentOtpTimes(phone, HOUR_SEC)
  const existing: OtpRecord | null = active
    ? {
        phone,
        codeHash: active.codeHash,
        expiresAt: active.expiresAt.getTime(),
        attempts: active.attempts,
        createdAt: active.createdAt.getTime(),
        recentRequests,
      }
    : recentRequests.length > 0
      ? {
          phone,
          codeHash: '',
          expiresAt: 0,
          attempts: 0,
          createdAt: recentRequests[recentRequests.length - 1]!,
          recentRequests,
        }
      : null

  const decision = canRequestCode(existing, Date.now(), policy.otp)
  if (!decision.allowed) {
    trace('blocked', { reason: 'phone-rate-limit', retryAfterSec: decision.retryAfterSec })
    return { ok: false, error: decision.reason, retryAfterSec: decision.retryAfterSec }
  }

  /**
   * سقف سراسری — لایه‌ای که سقف per-phone نمی‌پوشاند.
   *
   * مهاجم می‌تواند شماره عوض کند و سهمیه‌ی تازه بگیرد؛ این بند جلوی سوزاندن
   * کل اعتبار پیامک با چند ده شماره را می‌گیرد.
   */
  const globalRequests = pruneGlobal(await listRecentOtpTimesGlobal(HOUR_SEC))
  if (isGlobalLimitReached(globalRequests, Date.now(), policy.otp.maxGlobalPerHour)) {
    trace('blocked', { reason: 'global-rate-limit' })
    console.warn('[auth] global OTP rate limit hit — possible abuse')
    return { ok: false, error: 'سرویس ورود موقتاً شلوغ است. چند دقیقه بعد دوباره تلاش کنید.' }
  }

  // بازیابی فقط برای حساب دارای رمز است؛ ورود پیامکی فقط برای حساب کامل
  // موجود مجاز است. شمارهٔ تازه باید از مسیر ثبت‌نام عبور کند و هیچ پیامکی
  // از فرم ورود دریافت نمی‌کند.
  if (purpose === 'reset_password') {
    const account = await findUserByPhone(phone)
    if (
      !account
      || account.status !== 'active'
      || !account.passwordHash
    ) {
      trace('skipped', { reason: 'reset-account-ineligible' })
      // Keep the same browser challenge and rate-limit behaviour without
      // sending anything or revealing whether the reset account exists.
      return storeChallenge(generateCode(policy.otp.length))
    }
  } else if (purpose === 'login') {
    const account = await findUserByPhone(phone)
    if (!account || isUnregisteredPhoneAccount(account)) {
      trace('skipped', { reason: 'registration-required' })
      if (policy.allowRegistration) {
        return {
          ok: false,
          error: 'این شماره هنوز حساب کامل ندارد؛ ابتدا ثبت‌نام کنید.',
          needsRegistration: true,
        }
      }
      return { ok: true, phone }
    }
    if (
      account.status !== 'active' || account.blocked
    ) {
      trace('skipped', { reason: 'account-inactive' })
      return storeChallenge(generateCode(policy.otp.length))
    }
  }

  const code = generateCode(policy.otp.length)
  trace('provider-requested')
  const sent = await sendVerificationCode(phone, code, {
    devMode: policy.smsDevMode,
    siteName: policy.siteName,
  })
  if (!sent.ok) {
    trace('provider-rejected', { method: sent.method })
    // لاگ سرور جزئیات را دارد؛ کاربر فقط پیام عمومی می‌بیند.
    console.error('[auth] SMS send failed', sent.detail ?? sent.error)
    return { ok: false, error: sent.error ?? 'ارسال پیامک ناموفق بود.' }
  }

  trace(sent.method === 'dev' ? 'development-only' : 'provider-accepted', { method: sent.method, messageId: sent.messageId })
  return storeChallenge(code, sent.method === 'dev')
}

export async function requestRegistrationCodeAction(
  _prev: RequestCodeState,
  form: FormData,
): Promise<RequestCodeState> {
  const policy = await getAuthPolicy()
  if (!policy.allowRegistration) return { ok: false, error: 'ثبت‌نام موقتاً بسته است.' }
  if (!policy.registrationRequiresPhoneVerification) {
    return { ok: false, error: 'ثبت‌نام فعلی به کد تأیید نیاز ندارد.' }
  }
  const phone = normalizePhone(str(form, 'phone'))
  if (!phone) return { ok: false, error: 'شماره موبایل معتبر نیست. مثال: ۰۹۱۵۱۲۳۴۵۶۷' }
  const result = await requestPurposeCode(phone, 'verify_phone')
  if (result.needsLogin) {
    redirect(`${withAuthRedirect(paths.auth, str(form, 'redirectTo'))}&mode=login`)
  }
  return result
}

export async function requestResetCodeAction(
  _prev: RequestCodeState,
  form: FormData,
): Promise<RequestCodeState> {
  const phone = normalizePhone(str(form, 'phone'))
  if (!phone) return { ok: false, error: 'شماره موبایل معتبر نیست. مثال: ۰۹۱۵۱۲۳۴۵۶۷' }
  return requestPurposeCode(phone, 'reset_password')
}

export async function verifyRegistrationCodeAction(_previous: RequestCodeState, form: FormData): Promise<RequestCodeState> {
  const policy = await getAuthPolicy()
  if (!policy.allowRegistration || !policy.allowSmsVerification) return { ok: false, error: 'ثبت‌نام پیامکی موقتاً غیرفعال است.' }
  const phone = normalizePhone(str(form, 'phone'))
  if (!phone) return { ok: false, error: 'شماره موبایل معتبر نیست.' }
  const bound = await readOtpBrowser('verify_phone')
  const result = await verifyPurposeCode(phone, toAsciiDigits(str(form, 'code')).replace(/\D/g, ''), 'verify_phone', form.has('challengeId') ? Number(str(form, 'challengeId')) : undefined)
  if (!result.ok) return { ...result, challengeId: bound?.id }
  return bindRegistrationProof(phone, bound?.id ?? 0)
}

async function verifyPurposeCode(phone: string, code: string, purpose: OtpPurpose, submittedId?: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const policy = await getAuthPolicy()
  const bound = await readOtpBrowser(purpose)
  if (submittedId !== undefined && (!bound || submittedId !== bound.id)) return { ok: false, error: 'کد این صفحه جایگزین شده است. کد تازه درخواست کنید.' }
  if (bound && bound.phone !== phone) return { ok: false, error: 'شمارهٔ این درخواست تغییر کرده است. کد تازه بگیرید.' }
  return verifyStoredOtp(phone, code, purpose, policy.otp, bound?.id)
}

export async function requestCodeAction(
  _prev: RequestCodeState,
  form: FormData,
): Promise<RequestCodeState> {
  const phone = normalizePhone(str(form, 'phone'))
  if (!phone) return { ok: false, error: 'شماره موبایل معتبر نیست. مثال: ۰۹۱۵۱۲۳۴۵۶۷' }
  return requestPurposeCode(phone, 'login')
}

export async function verifyCodeAction(
  _prev: VerifyCodeState,
  form: FormData,
): Promise<VerifyCodeState> {
  if (!SESSION_SECRET) {
    return { ok: false, error: 'سرویس ورود تنظیم نشده است. (SESSION_SECRET)' }
  }
  const policy = await getAuthPolicy()
  if (!policy.allowOtpLogin) {
    return { ok: false, error: 'ورود پیامکی غیرفعال است؛ با رمز وارد شوید.' }
  }
  const phone = normalizePhone(str(form, 'phone'))
  const code = toAsciiDigits(str(form, 'code')).replace(/\D/g, '')
  if (!phone) return { ok: false, error: 'شماره موبایل معتبر نیست.' }

  const verified = await verifyPurposeCode(phone, code, 'login', form.has('challengeId') ? Number(str(form, 'challengeId')) : undefined)
  if (!verified.ok) return { ok: false, error: verified.error }

  const existing = await findUserByPhone(phone)
  if (
    !existing || isUnregisteredPhoneAccount(existing)
  ) {
    return policy.allowRegistration
      ? {
          ok: false,
          error: 'این شماره هنوز حساب کامل ندارد؛ ابتدا ثبت‌نام کنید.',
          needsRegistration: true,
        }
      : { ok: false, error: 'کد نامعتبر یا منقضی است.' }
  }
  if (existing.status !== 'active' || existing.blocked) {
    return { ok: false, error: 'کد نامعتبر یا منقضی است.' }
  }

  // ورود پیامکی فقط نشستِ کاربر موجود را ایجاد می‌کند؛ فرم ورود هرگز INSERT
  // انجام نمی‌دهد. ساخت حساب کاملاً در registerAction انجام می‌شود.
  let user = existing
  if (!user.phoneVerifiedAt) {
    user = (await markPhoneVerified(user.id)) ?? user
  }
  await startSession(user, policy.sessionMaxAgeSec, 'otp')
  finishAuth(form)
  return { ok: true, role: user.role, needsName: !user.name }
}

// ═══════════════════════════════════════════════════════════════════════
// مسیر ۲: یوزرنیم/شماره + رمز
// ═══════════════════════════════════════════════════════════════════════

export async function passwordLoginAction(
  _prev: PasswordLoginState,
  form: FormData,
): Promise<PasswordLoginState> {
  if (!SESSION_SECRET) {
    return { ok: false, error: 'سرویس ورود تنظیم نشده است. (SESSION_SECRET)' }
  }

  const policy = await getAuthPolicy()
  if (!policy.allowPasswordLogin) {
    return { ok: false, error: 'ورود موقتاً غیرفعال است؛ با پشتیبانی تماس بگیرید.' }
  }

  const identifier = str(form, 'identifier') || str(form, 'phone')
  const password = str(form, 'password')

  /*
    یک پیام برای همه‌ی حالت‌های شکست: حساب ناموجود، بدون رمز، رمز غلط.
    پیام‌های متفاوت، این فرم را به ابزار فهرست‌برداری تبدیل می‌کند.
  */
  const GENERIC = 'شناسه یا رمز عبور درست نیست.'
  if (!identifier || identifier.length > 100 || !password || password.length > MAX_PASSWORD_LENGTH) {
    return { ok: false, error: GENERIC }
  }

  const user = await findUserByLogin(identifier)
  if (!user || !user.passwordHash || user.blocked) return { ok: false, error: GENERIC }

  // رمز عبور منقضی نمی‌شود، پس brute-force رویش ارزش دارد.
  const lock = await getLockState(user.id)
  if (lock.locked) {
    const minutes = Math.ceil(lock.retryAfterSec / 60)
    return {
      ok: false,
      error: `تعداد تلاش‌های ناموفق زیاد بود. حدود ${minutes} دقیقه دیگر دوباره تلاش کنید.`,
    }
  }

  if (!verifyPassword(password, user.passwordHash)) {
    await recordFailedLogin(user.id, policy.lockout)
    return { ok: false, error: GENERIC }
  }

  await clearFailedLogins(user.id)
  await startSession(user, policy.sessionMaxAgeSec, 'password')
  finishAuth(form, user.mustChangePassword)

  return {
    ok: true,
    role: user.role,
    // رمزِ موقتِ صادرشده از پنل ادمین باید عوض شود، وگرنه رمزی که در
    // پیام‌رسان فرستاده شده تا ابد معتبر می‌ماند.
    mustChangePassword: user.mustChangePassword,
  }
}

// ═══════════════════════════════════════════════════════════════════════
// ثبت‌نام با رمز دائمی
// ═══════════════════════════════════════════════════════════════════════

/**
 * ساخت حساب با نام کاربری و رمز. تأیید شماره یک سیاست اختیاری ادمین است:
 * وقتی خاموش باشد اصلاً شماره‌ای از فرم قبول و ذخیره نمی‌کنیم تا کاربر
 * نتواند بدون اثبات مالکیت، شمارهٔ شخص دیگری را تصاحب کند.
 */
export async function registerAction(
  _prev: RegisterState,
  form: FormData,
): Promise<RegisterState> {
  if (!SESSION_SECRET) {
    return { ok: false, error: 'سرویس ورود تنظیم نشده است. (SESSION_SECRET)' }
  }

  const policy = await getAuthPolicy()
  if (!policy.allowRegistration) {
    return { ok: false, error: 'ثبت‌نام موقتاً بسته است.' }
  }

  const requirePhoneVerification = policy.registrationRequiresPhoneVerification
  const phone = requirePhoneVerification ? normalizePhone(str(form, 'phone')) : null
  const name = cleanUserText(str(form, 'name'), 60)
  const password = str(form, 'password')
  const confirm = str(form, 'passwordConfirm')
  const code = toAsciiDigits(str(form, 'code')).replace(/\D/g, '')
  const username = str(form, 'username').toLowerCase()

  if (!name) return { ok: false, error: 'نام را وارد کنید.' }
  if (requirePhoneVerification && !phone) {
    return { ok: false, error: 'شماره موبایل معتبر نیست. مثال: ۰۹۱۵۱۲۳۴۵۶۷' }
  }
  if (!requirePhoneVerification && !username) {
    return { ok: false, error: 'برای ساخت حساب، نام کاربری لازم است.' }
  }
  if (password.length < policy.passwordMinLength) {
    return { ok: false, error: `رمز عبور باید حداقل ${policy.passwordMinLength} کاراکتر باشد.` }
  }
  if (password.length > MAX_PASSWORD_LENGTH) return { ok: false, error: 'رمز عبور بیش از حد طولانی است.' }
  if (password !== confirm) return { ok: false, error: 'دو رمز یکسان نیستند.' }

  if (username) {
    if (!/^[a-z0-9_.]{3,32}$/.test(username)) {
      return {
        ok: false,
        error: 'یوزرنیم باید ۳ تا ۳۲ کاراکتر و فقط حروف لاتین کوچک، رقم، نقطه و زیرخط باشد.',
      }
    }
    // نام کاربری یک شناسهٔ عمومی است و بررسی آزادبودنش اطلاعات خصوصی
    // شماره را افشا نمی‌کند. این کنترل باید پیش از مصرف OTP انجام شود تا
    // کاربر به‌خاطر یک نامِ گرفته‌شده مجبور به درخواست کد تازه نشود.
    if (await isUsernameTaken(username)) {
      return { ok: false, error: 'این یوزرنیم گرفته شده است.' }
    }
  }

  if (requirePhoneVerification) {
    const proof = await readRegistrationProof()
    if (proof?.phone !== phone) {
      const verified = await verifyPurposeCode(phone!, code, 'verify_phone')
      if (!verified.ok) return { ok: false, error: verified.error }
    }
  }

  const existing = phone ? await findUserByPhone(phone) : null

  if (existing) {
    if (existing.blocked) return { ok: false, error: 'دسترسی این حساب مسدود شده است.' }
    if (existing.passwordHash) {
      // حساب از قبل رمز دارد → این «ثبت‌نام» نیست، «ورود» است.
      return {
        ok: false,
        error: 'این شماره از قبل حساب دارد. از بخش ورود با رمز استفاده کنید.',
      }
    }
    // حسابِ ساخته‌شده با کد پیامکی، الان رمز می‌گیرد.
    await setCredentials(existing.id, {
      passwordHash: hashPassword(password),
      username: username || existing.username,
      mustChangePassword: false,
    })
    await markPhoneVerified(existing.id)
    if (name && !existing.name) await updateUser(existing.id, { name })
    const updated = (await findUserById(existing.id))!
    await startSession(updated, policy.sessionMaxAgeSec, 'password')
    ;(await cookies()).delete(REGISTRATION_PROOF_COOKIE)
    finishAuth(form)
    return { ok: true, role: updated.role, linkedExisting: true }
  }

  let user
  try {
    user = await createUser({
      phone,
      username: username || null,
      name,
      passwordHash: hashPassword(password),
      role: 'customer',
      phoneVerifiedAt: requirePhoneVerification ? new Date() : null,
    })
  } catch (error) {
    // کنترل قبل از INSERT برای UX است؛ unique index مرجع نهایی در race است.
    if ((error as { code?: string }).code === 'ER_DUP_ENTRY') {
      return { ok: false, error: 'این نام کاربری یا شماره قبلاً استفاده شده است.' }
    }
    throw error
  }

  await startSession(user, policy.sessionMaxAgeSec, 'password')
  ;(await cookies()).delete(REGISTRATION_PROOF_COOKIE)
  finishAuth(form)
  return { ok: true, role: user.role }
}

// ═══════════════════════════════════════════════════════════════════════
// بازیابی رمز با OTP هدف‌دار
// ═══════════════════════════════════════════════════════════════════════

export async function resetPasswordAction(
  _prev: ResetPasswordState,
  form: FormData,
): Promise<ResetPasswordState> {
  const phone = normalizePhone(str(form, 'phone'))
  const code = toAsciiDigits(str(form, 'code')).replace(/\D/g, '')
  const password = str(form, 'password')
  const confirm = str(form, 'passwordConfirm')
  const policy = await getAuthPolicy()

  if (!phone) return { ok: false, error: 'شماره موبایل معتبر نیست.' }
  if (password.length < policy.passwordMinLength) {
    return { ok: false, error: `رمز عبور باید حداقل ${policy.passwordMinLength} کاراکتر باشد.` }
  }
  if (password.length > MAX_PASSWORD_LENGTH) return { ok: false, error: 'رمز عبور بیش از حد طولانی است.' }
  if (password !== confirm) return { ok: false, error: 'دو رمز یکسان نیستند.' }

  const verified = await verifyPurposeCode(phone, code, 'reset_password', form.has('challengeId') ? Number(str(form, 'challengeId')) : undefined)
  if (!verified.ok) return { ok: false, error: 'کد نامعتبر یا منقضی است.' }

  const account = await findUserByPhone(phone)
  if (!account || account.status !== 'active') {
    return { ok: false, error: 'کد نامعتبر یا منقضی است.' }
  }

  await setCredentials(account.id, {
    passwordHash: hashPassword(password),
    mustChangePassword: false,
  })
  await markPhoneVerified(account.id)
  await revokeAllSessions(account.id)
  await startSession(account, policy.sessionMaxAgeSec, 'password')
  finishAuth(form)
  return { ok: true }
}

// ═══════════════════════════════════════════════════════════════════════
// تغییر رمز
// ═══════════════════════════════════════════════════════════════════════

/**
 * تغییر رمز توسط خودِ کاربر.
 *
 * دو حالت را پوشش می‌دهد:
 *   • کاربری که رمز دارد و می‌خواهد عوضش کند → رمز فعلی لازم است
 *   • کاربری که ادمین رمز موقت داده و `mustChangePassword` دارد → همان رمز
 *     موقت به‌عنوان «رمز فعلی» پذیرفته می‌شود
 *   • کاربری که با کد پیامکی وارد شده و رمز ندارد → رمز فعلی لازم نیست
 */
export async function changePasswordAction(
  _prev: ChangePasswordState,
  form: FormData,
): Promise<ChangePasswordState> {
  const { user, actor, sessionId } = await getSession()
  if (!user) return { ok: false, error: 'ابتدا وارد شوید.' }
  // ادمینی که پنل کسی را «مشاهده» می‌کند، نباید رمز او را عوض کند.
  if (actor) return { ok: false, error: VIEW_AS_READONLY }

  const account = await findUserById(user.id)
  if (!account) return { ok: false, error: 'حساب پیدا نشد.' }

  const { passwordMinLength } = await getAuthPolicy()
  const current = str(form, 'currentPassword')
  const next = str(form, 'newPassword')
  const confirm = str(form, 'newPasswordConfirm')

  if (next.length < passwordMinLength) {
    return { ok: false, error: `رمز عبور باید حداقل ${passwordMinLength} کاراکتر باشد.` }
  }
  if (next.length > MAX_PASSWORD_LENGTH) return { ok: false, error: 'رمز عبور بیش از حد طولانی است.' }
  if (next !== confirm) return { ok: false, error: 'دو رمز یکسان نیستند.' }

  if (account.passwordHash) {
    if (!verifyPassword(current, account.passwordHash)) {
      return { ok: false, error: 'رمز فعلی درست نیست.' }
    }
    if (verifyPassword(next, account.passwordHash)) {
      return { ok: false, error: 'رمز جدید با رمز فعلی یکی است.' }
    }
  }

  await setCredentials(account.id, {
    passwordHash: hashPassword(next),
    mustChangePassword: false,
  })
  // تغییر رمز باید همهٔ دستگاه‌های دیگر را بیرون کند؛ نشست جاری معتبر می‌ماند.
  await revokeAllSessions(account.id, sessionId ?? undefined)
  revalidatePath('/', 'layout')
  finishAuth(form)
  return { ok: true }
}

export async function deactivateAccountAction(
  _prev: { ok: boolean; error?: string },
  form: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const { user, actor } = await getSession()
  if (!user) return { ok: false, error: 'ابتدا وارد شوید.' }
  if (actor) return { ok: false, error: VIEW_AS_READONLY }
  if (user.role === 'admin') return { ok: false, error: 'حساب مدیر را از پنل عمومی نمی‌توان غیرفعال کرد.' }

  const account = await findUserById(user.id)
  const password = str(form, 'password')
  const confirmation = str(form, 'confirmation')
  if (!account?.passwordHash || !verifyPassword(password, account.passwordHash)) {
    return { ok: false, error: 'رمز عبور درست نیست.' }
  }
  if (confirmation !== 'غیرفعال‌سازی حساب') {
    return { ok: false, error: 'عبارت تأیید را دقیق وارد کنید.' }
  }

  await deactivateUser(account.id)
  const store = await cookies()
  store.delete(SESSION_COOKIE)
  await stopViewAs()
  revalidatePath('/', 'layout')
  return { ok: true }
}

// ═══════════════════════════════════════════════════════════════════════
// نام و خروج
// ═══════════════════════════════════════════════════════════════════════

export async function setNameAction(
  _prev: { ok: boolean; error?: string },
  form: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const { user, actor } = await getSession()
  if (!user) return { ok: false, error: 'ابتدا وارد شوید.' }
  if (actor) return { ok: false, error: VIEW_AS_READONLY }

  const name = cleanUserText(str(form, 'name'), 60)
  if (!name) return { ok: false, error: 'نام را وارد کنید.' }

  await updateUser(user.id, { name })
  revalidatePath('/', 'layout')
  return { ok: true }
}

export async function signOutAction(): Promise<void> {
  /*
    در حالت «مشاهده به‌عنوان»، «خروج» یعنی خروج از همان حالت — نه از حساب
    ادمین. بدون این شرط، ادمینی که در پروفایلِ عاریتی دکمه‌ی خروج را می‌زد
    نشست واقعی خودش را پاک می‌کرد.
  */
  const { actor, user, sessionId } = await getSession()
  await stopViewAs()

  if (!actor) {
    if (user && sessionId) await revokeSession(sessionId, user.id)
    const store = await cookies()
    store.delete(SESSION_COOKIE)
  }

  revalidatePath('/', 'layout')
}
