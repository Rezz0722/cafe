'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { getSession } from '@/core/auth/currentUser'
import { stopViewAs, VIEW_AS_READONLY } from '@/core/auth/impersonation'
import {
  canRequestCode,
  generateCode,
  hashCode,
  isGlobalLimitReached,
  pruneGlobal,
  verifyCode,
  type OtpRecord,
} from '@/core/auth/otp'
import { hashPassword, verifyPassword } from '@/core/auth/password'
import { normalizePhone } from '@/core/auth/phone'
import { createSessionToken, SESSION_COOKIE } from '@/core/auth/session'
import {
  bumpOtpAttempts,
  clearFailedLogins,
  consumeOtp,
  createUser,
  findOrCreateUser,
  findUserByLogin,
  findUserById,
  findUserByPhone,
  getActiveOtp,
  getLockState,
  isUsernameTaken,
  listRecentOtpTimes,
  listRecentOtpTimesGlobal,
  recordFailedLogin,
  saveOtp,
  setCredentials,
  updateUser,
} from '@/core/auth/userRepo'
import { SESSION_SECRET } from '@/core/config/env'
import { getAuthPolicy } from '@/core/settings/policies'
import { sendVerificationCode } from '@/core/sms/smsir'
import type {
  ChangePasswordState,
  PasswordLoginState,
  RegisterState,
  RequestCodeState,
  VerifyCodeState,
} from './state'

/**
 * اکشن‌های احراز هویت.
 *
 * ═══ دو مسیر ورود، هر دو کامل ═══
 *
 * ۱. **کد پیامکی** — مسیر پیش‌فرض کاربر عادی.
 * ۲. **یوزرنیم/شماره + رمز دائمی** — مسیر دوم، نه راه فرار.
 *
 * دلیل وجود مسیر دوم: ورود فقط با پیامک یک نقطه‌ی شکست تک‌نقطه‌ای می‌سازد.
 * اعتبار پیامک که تمام شود یا سرویس که قطع شود، همه از پنل‌هایشان بیرون
 * می‌مانند. رمز دائمی یعنی سایت بدون پیامک هم کار می‌کند.
 *
 * ═══ قاعده‌ی امنیتی در کل فایل ═══
 *
 * **پیام خطا نباید بگوید حساب وجود دارد یا نه.** «کد فرستاده شد» برای
 * شماره‌ی ثبت‌نشده هم همان است، و شکستِ ورود با رمز یک پیام دارد — وگرنه این
 * فرم‌ها ابزار فهرست‌برداری از شماره‌ها و یوزرنیم‌ها می‌شوند.
 */

function str(form: FormData, key: string): string {
  const value = form.get(key)
  return typeof value === 'string' ? value.trim() : ''
}

const COOKIE_BASE = {
  httpOnly: true, // جاوااسکریپت نمی‌بیندش — XSS نمی‌تواند بدزددش
  sameSite: 'lax' as const, // جلوی CSRF پایه
  secure: process.env.NODE_ENV === 'production',
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
): Promise<void> {
  const store = await cookies()
  store.set(
    SESSION_COOKIE,
    createSessionToken({ userId: user.id, phone: user.phone, role: user.role }, maxAgeSec),
    { ...COOKIE_BASE, maxAge: maxAgeSec },
  )
  revalidatePath('/', 'layout')
}

/** یک ساعت — پنجره‌ی سقف درخواست کد. */
const HOUR_SEC = 3600

// ═══════════════════════════════════════════════════════════════════════
// مسیر ۱: کد پیامکی
// ═══════════════════════════════════════════════════════════════════════

export async function requestCodeAction(
  _prev: RequestCodeState,
  form: FormData,
): Promise<RequestCodeState> {
  if (!SESSION_SECRET) {
    return { ok: false, error: 'سرویس ورود تنظیم نشده است. (SESSION_SECRET)' }
  }

  const policy = await getAuthPolicy()
  if (!policy.allowOtpLogin) {
    return { ok: false, error: 'ورود با کد پیامکی موقتاً غیرفعال است. با رمز عبور وارد شوید.' }
  }

  const phone = normalizePhone(str(form, 'phone'))
  if (!phone) {
    return { ok: false, error: 'شماره موبایل معتبر نیست. مثال: ۰۹۱۵۱۲۳۴۵۶۷' }
  }

  /*
    منطق محدودیت نرخ در `otp.ts` است و تست دارد. اینجا فقط ورودی‌اش از
    دیتابیس ساخته می‌شود: رکورد فعلی به‌علاوه‌ی زمان درخواست‌های اخیر.
    بازنویسی آن منطق روی SQL یعنی دو پیاده‌سازی از یک قاعده.
  */
  const active = await getActiveOtp(phone)
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
    console.warn('[auth] global OTP rate limit hit — possible abuse')
    return { ok: false, error: 'سرویس ورود موقتاً شلوغ است. چند دقیقه بعد دوباره تلاش کنید.' }
  }

  const code = generateCode(policy.otp.length)
  const sent = await sendVerificationCode(phone, code, {
    devMode: policy.smsDevMode,
    siteName: policy.siteName,
  })
  if (!sent.ok) {
    // لاگ سرور جزئیات را دارد؛ کاربر فقط پیام عمومی می‌بیند.
    console.error('[auth] SMS send failed', sent.detail ?? sent.error)
    return { ok: false, error: sent.error ?? 'ارسال پیامک ناموفق بود.' }
  }

  await saveOtp({ phone, codeHash: hashCode(phone, code), ttlSec: policy.otp.ttlSeconds })
  return { ok: true, phone, devMode: sent.method === 'dev' }
}

export async function verifyCodeAction(
  _prev: VerifyCodeState,
  form: FormData,
): Promise<VerifyCodeState> {
  const policy = await getAuthPolicy()
  if (!policy.allowOtpLogin) {
    return { ok: false, error: 'ورود با کد پیامکی موقتاً غیرفعال است.' }
  }

  const phone = normalizePhone(str(form, 'phone'))
  const code = str(form, 'code').replace(/\D/g, '')

  if (!phone) return { ok: false, error: 'شماره نامعتبر است.' }
  if (!code) return { ok: false, error: 'کد را وارد کنید.' }

  const active = await getActiveOtp(phone)
  const record: OtpRecord | null = active
    ? {
        phone,
        codeHash: active.codeHash,
        expiresAt: active.expiresAt.getTime(),
        attempts: active.attempts,
        createdAt: active.createdAt.getTime(),
        recentRequests: [],
      }
    : null

  const result = verifyCode(record, phone, code, Date.now(), policy.otp.maxAttempts)
  if (!result.ok) {
    if (active) {
      // `burned` یعنی رکورد دیگر قابل استفاده نیست — مصرفش کن تا تلاش
      // بعدی روی همان کد بی‌فایده باشد.
      if (result.burned) await consumeOtp(active.id)
      else await bumpOtpAttempts(active.id)
    }
    return { ok: false, error: result.reason }
  }

  // کد درست بود — بلافاصله بسوزانش تا دوبار قابل استفاده نباشد.
  if (active) await consumeOtp(active.id)

  const user = await findOrCreateUser(phone)
  if (user.blocked) return { ok: false, error: 'دسترسی این حساب مسدود شده است.' }

  await startSession(user, policy.sessionMaxAgeSec)
  return { ok: true, needsName: !user.name, role: user.role }
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
    return { ok: false, error: 'ورود با رمز موقتاً غیرفعال است. با کد پیامکی وارد شوید.' }
  }

  const identifier = str(form, 'identifier') || str(form, 'phone')
  const password = str(form, 'password')

  /*
    یک پیام برای همه‌ی حالت‌های شکست: حساب ناموجود، بدون رمز، رمز غلط.
    پیام‌های متفاوت، این فرم را به ابزار فهرست‌برداری تبدیل می‌کند.
  */
  const GENERIC = 'شناسه یا رمز عبور درست نیست.'
  if (!identifier || !password) return { ok: false, error: GENERIC }

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
  await startSession(user, policy.sessionMaxAgeSec)

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
 * ساخت حساب با شماره و رمز — بدون نیاز به پیامک.
 *
 * ═══ چرا بدون تأیید شماره ═══
 *
 * تا وقتی سرویس پیامک در دسترس نیست، اصرار بر تأیید شماره یعنی هیچ‌کس
 * نمی‌تواند ثبت‌نام کند. شماره به‌عنوان **شناسه‌ی ورود** ثبت می‌شود نه
 * شماره‌ی تأییدشده؛ هر جایی که به شماره‌ی تأییدشده نیاز باشد (مثل تصاحب
 * صفحه‌ی کافه) جداگانه تأیید می‌خواهد.
 *
 * اگر شماره از قبل حسابِ بی‌رمز داشته باشد (با کد پیامکی ساخته شده)، همان
 * حساب رمز می‌گیرد — نه حساب دوم. حساب دوم با همان شماره، کاربر را از
 * سابقه‌ی خودش جدا می‌کند.
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

  const phone = normalizePhone(str(form, 'phone'))
  const name = str(form, 'name').slice(0, 60)
  const password = str(form, 'password')
  const confirm = str(form, 'passwordConfirm')
  const username = str(form, 'username').toLowerCase()

  if (!phone) return { ok: false, error: 'شماره موبایل معتبر نیست. مثال: ۰۹۱۵۱۲۳۴۵۶۷' }
  if (password.length < policy.passwordMinLength) {
    return { ok: false, error: `رمز عبور باید حداقل ${policy.passwordMinLength} کاراکتر باشد.` }
  }
  if (password !== confirm) return { ok: false, error: 'دو رمز یکسان نیستند.' }

  if (username) {
    if (!/^[a-z0-9_.]{3,32}$/.test(username)) {
      return {
        ok: false,
        error: 'یوزرنیم باید ۳ تا ۳۲ کاراکتر و فقط حروف لاتین کوچک، رقم، نقطه و زیرخط باشد.',
      }
    }
    if (await isUsernameTaken(username)) {
      return { ok: false, error: 'این یوزرنیم گرفته شده است.' }
    }
  }

  const existing = await findUserByPhone(phone)

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
    if (name && !existing.name) await updateUser(existing.id, { name })
    const updated = (await findUserById(existing.id))!
    await startSession(updated, policy.sessionMaxAgeSec)
    return { ok: true, role: updated.role, linkedExisting: true }
  }

  const user = await createUser({
    phone,
    username: username || null,
    name,
    passwordHash: hashPassword(password),
    role: 'customer',
  })

  await startSession(user, policy.sessionMaxAgeSec)
  return { ok: true, role: user.role }
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
  const { user, actor } = await getSession()
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

  const name = str(form, 'name').slice(0, 60)
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
  const { actor } = await getSession()
  await stopViewAs()

  if (!actor) {
    const store = await cookies()
    store.delete(SESSION_COOKIE)
  }

  revalidatePath('/', 'layout')
}
