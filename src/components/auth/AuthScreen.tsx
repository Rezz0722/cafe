'use client'

import { useActionState, useEffect, useRef, useState, type ReactNode } from 'react'
import { useFormStatus } from 'react-dom'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { passwordLoginAction, requestCodeAction, verifyCodeAction } from '@/app/auth/actions'
import { EMPTY_PASSWORD_STATE, EMPTY_REQUEST_STATE, EMPTY_VERIFY_STATE } from '@/app/auth/state'
import { maskPhone } from '@/core/auth/phone'
import { safeAuthRedirect, withAuthRedirect } from '@/core/auth/redirect'
import { fa } from '@/lib/format'
import { paths } from '@/routes'
import styles from './AuthScreen.module.css'

export interface AuthConfig {
  otpLength: number
  otpTtlSeconds: number
  resendCooldownSeconds: number
  passwordMinLength: number
  allowRegistration: boolean
  allowPasswordLogin: boolean
  allowOtpLogin: boolean
  allowSmsVerification: boolean
  registrationRequiresPhoneVerification: boolean
}

export function AuthProgress({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div
      className={styles.progress}
      data-count={steps.length}
      style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
      aria-label={`مرحله ${current} از ${steps.length}`}
    >
      {steps.map((step, index) => {
        const number = index + 1
        const state = number < current ? 'done' : number === current ? 'current' : 'upcoming'
        return (
          <div key={step} className={styles.progressStep} data-state={state} aria-current={state === 'current' ? 'step' : undefined}>
            <span>{state === 'done' ? '✓' : number.toLocaleString('fa-IR')}</span>
            <small>{step}</small>
          </div>
        )
      })}
    </div>
  )
}

export function AuthSubmit({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className={styles.primary} disabled={pending} aria-disabled={pending}>
      {pending ? pendingLabel : label}
    </button>
  )
}

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className={styles.wrap}>
      <div className={styles.card}>
        {children}
      </div>
    </main>
  )
}

export function AuthScreen({ config }: { config: AuthConfig }) {
  const router = useRouter()
  const params = useSearchParams()
  const redirectTo = safeAuthRedirect(params?.get('redirect'), paths.profile)
  const [state, action] = useActionState(passwordLoginAction, EMPTY_PASSWORD_STATE)
  const [showPassword, setShowPassword] = useState(false)
  const [mode, setMode] = useState<'password' | 'otp'>(config.allowPasswordLogin ? 'password' : 'otp')

  useEffect(() => {
    if (!state.ok) return
    router.replace(state.mustChangePassword ? paths.changePassword : redirectTo)
    router.refresh()
  }, [state, router, redirectTo])

  return (
    <AuthShell>
      <div className={styles.authHeading}>
        <span className={styles.kicker}>خوش آمدی</span>
        <h1 className={styles.title}>ورود به کو کافه</h1>
        <p className={styles.lede}>برای ذخیره کافه‌ها، ثبت تجربه و مدیریت حساب وارد شوید.</p>
      </div>

      {config.allowPasswordLogin && config.allowOtpLogin && (
        <div className={styles.methodTabs} role="tablist" aria-label="روش ورود">
          <button type="button" role="tab" aria-selected={mode === 'password'} onClick={() => setMode('password')}>رمز عبور</button>
          <button type="button" role="tab" aria-selected={mode === 'otp'} onClick={() => setMode('otp')}>کد یک‌بارمصرف</button>
        </div>
      )}

      {mode === 'password' && config.allowPasswordLogin ? (
        <form action={action} className={styles.form}>
          <label className={styles.field}>
            <span className={styles.label}>شماره موبایل یا نام کاربری</span>
            <input name="identifier" className={styles.input} autoComplete="username" maxLength={100} dir="ltr" placeholder="مثلاً 09151234567" required autoFocus />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>رمز عبور</span>
            <span className={styles.passwordWrap}>
              <input name="password" className={styles.input} type={showPassword ? 'text' : 'password'} autoComplete="current-password" maxLength={256} dir="ltr" required />
              <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'پنهان‌کردن رمز' : 'نمایش رمز'}>{showPassword ? 'پنهان' : 'نمایش'}</button>
            </span>
          </label>
          {state.error && <div className={styles.error} role="alert" aria-live="polite">{state.error}</div>}
          <AuthSubmit label="ورود به حساب" pendingLabel="در حال بررسی…" />
          <Link className={`${styles.linkButton} ${styles.centerLink}`} href={withAuthRedirect(paths.authRecover, redirectTo)}>رمز را فراموش کرده‌ام</Link>
        </form>
      ) : config.allowOtpLogin ? (
        <OtpLogin redirectTo={redirectTo} config={config} />
      ) : (
        <div className={styles.error} role="alert">ورود موقتاً غیرفعال است.</div>
      )}

      {config.allowRegistration && (
        <div className={styles.signupPrompt}>
          <span>هنوز حساب نداری؟</span>
          <Link href={withAuthRedirect(paths.authRegister, redirectTo)}>ساخت حساب رایگان</Link>
        </div>
      )}
    </AuthShell>
  )
}

function OtpLogin({ redirectTo, config }: { redirectTo: string; config: AuthConfig }) {
  const router = useRouter()
  const codeRef = useRef<HTMLInputElement>(null)
  const [phone, setPhone] = useState('')
  const [requestState, requestAction] = useActionState(requestCodeAction, EMPTY_REQUEST_STATE)
  const [verifyState, verifyAction] = useActionState(verifyCodeAction, EMPTY_VERIFY_STATE)

  useEffect(() => {
    if (requestState.needsRegistration) {
      router.replace(withAuthRedirect(paths.authRegister, redirectTo))
      router.refresh()
      return
    }
    if (!requestState.ok || !requestState.phone) return
    setPhone(requestState.phone)
    queueMicrotask(() => codeRef.current?.focus())
  }, [requestState, redirectTo, router])

  useEffect(() => {
    if (verifyState.needsRegistration) {
      router.replace(withAuthRedirect(paths.authRegister, redirectTo))
      router.refresh()
      return
    }
    if (!verifyState.ok) return
    router.replace(redirectTo)
    router.refresh()
  }, [verifyState, redirectTo, router])

  /**
   * Web OTP روی Android Chrome کد را از SMS دامنه‌محور می‌خواند. این API
   * اختیاری است و در iOS، دسکتاپ یا SMSهای قدیمی وجود ندارد؛ در آن حالت
   * `autocomplete="one-time-code"` و ورود دستی همچنان کار می‌کنند.
   * هر بار عوض‌شدن شماره، listener قبلی با AbortController متوقف می‌شود تا
   * کد شماره‌ی قبلی روی فرم شماره‌ی جدید نوشته نشود.
   */
  useEffect(() => {
    if (!phone || typeof window === 'undefined' || !window.isSecureContext) return
    if (!('OTPCredential' in window) || !navigator.credentials?.get) return

    const controller = new AbortController()
    let cancelled = false

    void navigator.credentials
      .get({
        otp: { transport: ['sms'] },
        signal: controller.signal,
      } as CredentialRequestOptions & { otp: { transport: ['sms'] } })
      .then((credential) => {
        if (cancelled || !credential) return
        const value = credential as Credential & { code?: string }
        const code = value.code?.replace(/\D/g, '').slice(0, config.otpLength)
        if (!code || !codeRef.current) return
        codeRef.current.value = code
        codeRef.current.dispatchEvent(new Event('input', { bubbles: true }))
      })
      .catch((error: unknown) => {
        // لغو هنگام تغییر شماره/خروج، خطای واقعی نیست. خطاهای Web OTP نباید
        // فرم ورود دستی را خراب کنند یا در UI به کاربر نشان داده شوند.
        if (error instanceof DOMException && error.name === 'AbortError') return
        if (process.env.NODE_ENV !== 'production') console.debug('[auth] Web OTP unavailable', error)
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [phone, config.otpLength])

  if (!phone) {
    return (
      <form action={requestAction} className={styles.form}>
        <p className={styles.compactNote}>ورود پیامکی فقط برای حساب‌های ثبت‌شده است. برای شماره جدید، ابتدا «ساخت حساب رایگان» را انتخاب کنید.</p>
        <label className={styles.field}>
          <span className={styles.label}>شماره موبایل</span>
          <input name="phone" className={styles.input} type="tel" inputMode="numeric" autoComplete="tel" placeholder="09151234567" dir="ltr" required autoFocus />
        </label>
        {requestState.error && <div className={styles.error} role="alert">{requestState.error}</div>}
        <AuthSubmit label="دریافت کد ورود" pendingLabel="در حال ارسال…" />
      </form>
    )
  }

  return (
    <form action={verifyAction} className={styles.form}>
      <input type="hidden" name="phone" value={phone} />
      <p className={styles.compactNote}>کد ارسال‌شده به <b dir="ltr">{maskPhone(phone)}</b> را وارد کنید؛ این کد فقط {fa(config.otpTtlSeconds)} ثانیه اعتبار دارد.</p>
      {requestState.devMode && <div className={styles.devNote}>حالت توسعه پیامک فعال است.</div>}
      <label className={styles.field}>
        <span className={styles.label}>کد یک‌بارمصرف</span>
        <input ref={codeRef} name="code" className={`${styles.input} ${styles.codeInput}`} inputMode="numeric" autoComplete="one-time-code" maxLength={config.otpLength} dir="ltr" required />
      </label>
      {verifyState.error && <div className={styles.error} role="alert">{verifyState.error}</div>}
      <AuthSubmit label="تأیید و ورود" pendingLabel="در حال بررسی…" />
      <button type="button" className={`${styles.linkButton} ${styles.centerLink}`} onClick={() => setPhone('')}>تغییر شماره</button>
    </form>
  )
}
