'use client'

import { useActionState, useEffect, useState, type ReactNode } from 'react'
import { useFormStatus } from 'react-dom'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { passwordLoginAction, requestCodeAction, verifyCodeAction } from '@/app/auth/actions'
import { EMPTY_PASSWORD_STATE, EMPTY_REQUEST_STATE, EMPTY_VERIFY_STATE } from '@/app/auth/state'
import { maskPhone } from '@/core/auth/phone'
import { safeAuthRedirect, withAuthRedirect } from '@/core/auth/redirect'
import { fa } from '@/lib/format'
import { paths } from '@/routes'
import { useOtpChallenge } from '@/hooks/useOtpChallenge'
import { useWebOtp } from '@/hooks/useWebOtp'
import { toAsciiDigits } from '@/core/text/normalize'
import { OtpTiming } from './OtpTiming'
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
  initialOtp?: boolean
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

export function AuthSubmit({ label, pendingLabel, disabled = false }: { label: string; pendingLabel: string; disabled?: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className={styles.primary} disabled={pending || disabled} aria-disabled={pending || disabled} aria-busy={pending}>
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
  const [mode, setMode] = useState<'password' | 'otp'>(config.initialOtp || !config.allowPasswordLogin ? 'otp' : 'password')

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

      {config.allowRegistration && (
        <div className={styles.signupPrompt}>
          <span>هنوز حساب نداری؟</span>
          <Link href={withAuthRedirect(paths.authRegister, redirectTo)}>ساخت حساب رایگان</Link>
        </div>
      )}

      {config.allowPasswordLogin && config.allowOtpLogin && (
        <div className={styles.methodTabs} role="tablist" aria-label="روش ورود">
          <button type="button" role="tab" aria-selected={mode === 'password'} onClick={() => setMode('password')}>رمز عبور</button>
          <button type="button" role="tab" aria-selected={mode === 'otp'} onClick={() => setMode('otp')}>کد یک‌بارمصرف</button>
        </div>
      )}

      {mode === 'password' && config.allowPasswordLogin ? (
        <form action={action} className={styles.form}>
      <input type="hidden" name="redirectTo" value={redirectTo} />
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


    </AuthShell>
  )
}

function ResendCodeSubmit({ remaining }: { remaining: number }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className={`${styles.linkButton} ${styles.centerLink}`} disabled={pending || remaining > 0}>
      {pending ? 'در حال ارسال…' : remaining > 0 ? `ارسال دوباره تا ${fa(remaining)} ثانیهٔ دیگر` : 'ارسال دوبارهٔ کد'}
    </button>
  )
}

function OtpLogin({ redirectTo, config }: { redirectTo: string; config: AuthConfig }) {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [requestState, requestAction, requestPending] = useActionState(requestCodeAction, EMPTY_REQUEST_STATE)
  const { challenge, codeRemaining, resendRemaining, expired, reset } = useOtpChallenge('login', requestState)
  const { start: startWebOtp, stop: stopWebOtp, restore: restoreWebOtp } = useWebOtp(config.otpLength, setCode)
  const phone = challenge?.phone ?? ''
  useEffect(() => { if (phone && !expired) restoreWebOtp() }, [phone, expired, restoreWebOtp])
  const prepareRequest = () => { setCode(''); startWebOtp() }
  useEffect(() => {
    if (!requestState.needsRegistration) return
    router.replace(withAuthRedirect(paths.authRegister, redirectTo))
    router.refresh()
  }, [requestState, redirectTo, router])

  if (!phone) return (
    <form action={requestAction} onSubmit={prepareRequest} className={styles.form}>
      <p className={styles.compactNote}>حساب جدید می‌خواهی؟ <Link href={withAuthRedirect(paths.authRegister, redirectTo)}>ساخت حساب رایگان</Link></p>
      <label className={styles.field}>
        <span className={styles.label}>شماره موبایل</span>
        <input name="phone" className={styles.input} type="tel" inputMode="numeric" autoComplete="tel" placeholder="09151234567" dir="ltr" required autoFocus />
      </label>
      {requestState.error && <div className={styles.error} role="alert">{requestState.error}</div>}
      <AuthSubmit label="دریافت کد ورود" pendingLabel="در حال ارسال…" />
    </form>
  )
  return (
    <div className={styles.form}>
      <p id="otp-code-status" className={styles.compactNote}>کد فرستاده‌شده به <b dir="ltr">{maskPhone(phone)}</b> را وارد کنید.</p>
      <OtpTiming remaining={codeRemaining} resendRemaining={resendRemaining} />
      {requestState.devMode && <div className={styles.devNote}>حالت توسعه پیامک فعال است.</div>}
      <OtpVerifyForm key={challenge?.challengeId} challengeId={challenge?.challengeId} code={code} onCode={setCode} phone={phone} redirectTo={redirectTo} otpLength={config.otpLength} disabled={expired || requestPending} />
      <form action={requestAction} onSubmit={prepareRequest} className={styles.form} aria-label="ارسال دوبارهٔ کد ورود">
        <input type="hidden" name="phone" value={phone} />
        {requestState.error && <div className={styles.error} role="alert">{requestState.error}</div>}
        <ResendCodeSubmit remaining={resendRemaining} />
      </form>
      <button type="button" className={`${styles.linkButton} ${styles.centerLink}`} disabled={requestPending} onClick={() => { stopWebOtp(); setCode(''); reset() }}>تغییر شماره</button>
    </div>
  )
}

/** A new code resets both the input and errors from the previous code. */
function OtpVerifyForm({ code, onCode, phone, redirectTo, otpLength, disabled, challengeId }: {
  challengeId?: number
  code: string
  onCode: (value: string) => void
  phone: string
  redirectTo: string
  otpLength: number
  disabled: boolean
}) {
  const router = useRouter()
  const [state, action] = useActionState(verifyCodeAction, EMPTY_VERIFY_STATE)
  useEffect(() => {
    if (state.needsRegistration) {
      router.replace(withAuthRedirect(paths.authRegister, redirectTo))
      router.refresh()
      return
    }
    if (!state.ok) return
    router.replace(redirectTo)
    router.refresh()
  }, [state, redirectTo, router])

  return (
    <form action={action} className={styles.form}>
      <input type="hidden" name="redirectTo" value={redirectTo} />
      <input type="hidden" name="phone" value={phone} />
      <input type="hidden" name="challengeId" value={challengeId ?? ''} />
      <label className={styles.field}>
        <span className={styles.label}>کد یک‌بارمصرف</span>
        <input value={code} onChange={event => onCode(toAsciiDigits(event.target.value).replace(/\D/g, '').slice(0, otpLength))} autoFocus name="code" className={`${styles.input} ${styles.codeInput}`} inputMode="numeric" autoComplete="one-time-code" maxLength={otpLength} dir="ltr" required aria-invalid={Boolean(state.error)} aria-describedby={state.error ? 'otp-code-status otp-verify-error' : 'otp-code-status'} />
      </label>
      {state.error && <div id="otp-verify-error" className={styles.error} role="alert">{state.error}</div>}
      <AuthSubmit label="تأیید و ورود" pendingLabel="در حال بررسی…" disabled={disabled} />
    </form>
  )
}
