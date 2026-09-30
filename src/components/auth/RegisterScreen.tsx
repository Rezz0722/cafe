'use client'

import { useActionState, useEffect, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { registerAction, requestRegistrationCodeAction } from '@/app/auth/actions'
import { EMPTY_REGISTER_STATE, EMPTY_REQUEST_STATE } from '@/app/auth/state'
import { maskPhone } from '@/core/auth/phone'
import { safeAuthRedirect, withAuthRedirect } from '@/core/auth/redirect'
import { fa } from '@/lib/format'
import { paths } from '@/routes'
import { AuthProgress, AuthShell, AuthSubmit, type AuthConfig } from './AuthScreen'
import styles from './AuthScreen.module.css'

export function RegisterScreen({ config }: { config: AuthConfig }) {
  const router = useRouter()
  const params = useSearchParams()
  const redirectTo = safeAuthRedirect(params?.get('redirect'), paths.profile)
  const [step, setStep] = useState(1)
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [localError, setLocalError] = useState('')
  const [requestState, requestAction] = useActionState(requestRegistrationCodeAction, EMPTY_REQUEST_STATE)
  const [registerState, registerActionState] = useActionState(registerAction, EMPTY_REGISTER_STATE)

  useEffect(() => {
    if (requestState.ok && requestState.phone) {
      setPhone(requestState.phone)
      setStep(2)
      setLocalError('')
    }
  }, [requestState])

  useEffect(() => {
    if (!registerState.ok) return
    router.replace(redirectTo)
    router.refresh()
  }, [registerState, redirectTo, router])

  const steps = ['شماره', 'تأیید', 'مشخصات', 'رمز عبور']

  function continueFromCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const clean = code.replace(/\D/g, '')
    if (clean.length !== config.otpLength) {
      setLocalError(`کد ${fa(config.otpLength)} رقمی را کامل وارد کنید.`)
      return
    }
    setCode(clean)
    setLocalError('')
    setStep(3)
  }

  function continueFromProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!name.trim()) {
      setLocalError('نامت را وارد کن.')
      return
    }
    if (!config.registrationRequiresPhoneVerification && !username) {
      setLocalError('برای ورود، یک نام کاربری انتخاب کن.')
      return
    }
    if (username && !/^[a-zA-Z0-9_.]{3,32}$/.test(username)) {
      setLocalError('نام کاربری باید ۳ تا ۳۲ کاراکتر و فقط شامل حروف لاتین، عدد، نقطه یا زیرخط باشد.')
      return
    }
    setLocalError('')
    setStep(config.registrationRequiresPhoneVerification ? 4 : 2)
  }

  if (!config.registrationRequiresPhoneVerification) {
    const simpleSteps = ['مشخصات', 'رمز عبور']
    return (
      <AuthShell>
        <AuthProgress steps={simpleSteps} current={step} />
        {step === 1 ? (
          <form className={styles.form} onSubmit={continueFromProfile}>
            <h1 className={styles.title}>ساخت حساب</h1>
            <p className={styles.lede}>بدون پیامک و کد تأیید؛ نام کاربری و رمزت برای ورود کافی است.</p>
            <label className={styles.field}>
              <span className={styles.label}>نام</span>
              <input value={name} onChange={(event) => setName(event.target.value)} className={styles.input} maxLength={60} autoComplete="name" required autoFocus />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>نام کاربری</span>
              <input value={username} onChange={(event) => setUsername(event.target.value)} className={styles.input} autoComplete="username" pattern="[a-zA-Z0-9_.]{3,32}" placeholder="مثلاً alireza_90" dir="ltr" required />
              <span className={styles.hint}>۳ تا ۳۲ کاراکتر؛ حروف لاتین، عدد، نقطه یا زیرخط</span>
            </label>
            {localError && <div className={styles.error} role="alert">{localError}</div>}
            <button type="submit" className={styles.primary}>ادامه</button>
            <Link className={`${styles.linkButton} ${styles.centerLink}`} href={withAuthRedirect(paths.auth, redirectTo)}>حساب دارم</Link>
          </form>
        ) : (
          <form action={registerActionState} className={styles.form}>
            <input type="hidden" name="name" value={name.trim()} />
            <input type="hidden" name="username" value={username.toLowerCase()} />
            <h1 className={styles.title}>رمز ورودت را بساز</h1>
            <p className={styles.lede}>از این به بعد با نام کاربری <b dir="ltr">{username.toLowerCase()}</b> و این رمز وارد می‌شوی.</p>
            <label className={styles.field}>
              <span className={styles.label}>رمز عبور</span>
              <input name="password" className={styles.input} type="password" autoComplete="new-password" minLength={config.passwordMinLength} maxLength={256} dir="ltr" required autoFocus />
              <span className={styles.hint}>حداقل {fa(config.passwordMinLength)} کاراکتر</span>
            </label>
            <label className={styles.field}>
              <span className={styles.label}>تکرار رمز عبور</span>
              <input name="passwordConfirm" className={styles.input} type="password" autoComplete="new-password" minLength={config.passwordMinLength} maxLength={256} dir="ltr" required />
            </label>
            {registerState.error && <div className={styles.error} role="alert" aria-live="polite">{registerState.error}</div>}
            <AuthSubmit label="ساخت حساب و ورود" pendingLabel="در حال ساخت…" />
            <button type="button" className={`${styles.linkButton} ${styles.centerLink}`} onClick={() => setStep(1)}>ویرایش مشخصات</button>
          </form>
        )}
      </AuthShell>
    )
  }

  return (
    <AuthShell>
      <AuthProgress steps={steps} current={step} />

      {step === 1 ? (
        <form action={requestAction} className={styles.form}>
          <h1 className={styles.title}>ساخت حساب</h1>
          <p className={styles.lede}>اول شماره موبایلت را تأیید می‌کنیم؛ بعد برای ورودهای همیشگی رمز می‌سازی.</p>
          {!config.allowSmsVerification && <div className={styles.error} role="alert">ثبت‌نام پیامکی موقتاً غیرفعال است.</div>}
          <label className={styles.field}>
            <span className={styles.label}>شماره موبایل</span>
            <input name="phone" className={styles.input} type="tel" inputMode="numeric" autoComplete="tel" placeholder="09151234567" dir="ltr" required autoFocus disabled={!config.allowSmsVerification} />
          </label>
          {requestState.error && <div className={styles.error} role="alert">{requestState.error}</div>}
          {config.allowSmsVerification && <AuthSubmit label="ادامه و دریافت کد" pendingLabel="در حال ارسال…" />}
          <div className={styles.actionsRow}>
            <Link className={styles.linkButton} href={withAuthRedirect(paths.auth, redirectTo)}>حساب دارم</Link>
          </div>
        </form>
      ) : step === 2 ? (
        <form className={styles.form} onSubmit={continueFromCode}>
          <h1 className={styles.title}>تأیید شماره</h1>
          <p className={styles.lede}>کد {fa(config.otpLength)} رقمی فرستاده‌شده به <b dir="ltr">{maskPhone(phone)}</b> را وارد کن. این کد فقط {fa(config.otpTtlSeconds)} ثانیه اعتبار دارد.</p>
          {requestState.devMode && <div className={styles.devNote}>حالت توسعه فعال است؛ کد در لاگ امن سرور ثبت شده است.</div>}
          <label className={styles.field}>
            <span className={styles.label}>کد تأیید</span>
            <input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, config.otpLength))} name="code" className={`${styles.input} ${styles.codeInput}`} inputMode="numeric" autoComplete="one-time-code" maxLength={config.otpLength} dir="ltr" required autoFocus />
          </label>
          {localError && <div className={styles.error} role="alert">{localError}</div>}
          <button type="submit" className={styles.primary}>ادامه</button>
          <button type="button" className={`${styles.linkButton} ${styles.centerLink}`} onClick={() => { setStep(1); setPhone(''); setCode(''); setLocalError('') }}>تغییر شماره یا ارسال دوباره</button>
        </form>
      ) : step === 3 ? (
        <form className={styles.form} onSubmit={continueFromProfile}>
          <h1 className={styles.title}>چطور صدایت کنیم؟</h1>
          <p className={styles.lede}>این مشخصات در پروفایل و کنار تجربه‌هایی که ثبت می‌کنی استفاده می‌شود.</p>
          <label className={styles.field}>
            <span className={styles.label}>نام</span>
            <input value={name} onChange={(event) => setName(event.target.value)} className={styles.input} maxLength={60} autoComplete="name" required autoFocus />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>نام کاربری <small>(اختیاری)</small></span>
            <input value={username} onChange={(event) => setUsername(event.target.value)} className={styles.input} autoComplete="username" pattern="[a-zA-Z0-9_.]{3,32}" placeholder="مثلاً alireza_90" dir="ltr" />
          </label>
          {localError && <div className={styles.error} role="alert">{localError}</div>}
          <button type="submit" className={styles.primary}>ادامه</button>
          <button type="button" className={`${styles.linkButton} ${styles.centerLink}`} onClick={() => setStep(2)}>مرحله قبل</button>
        </form>
      ) : (
        <form action={registerActionState} className={styles.form}>
          <input type="hidden" name="phone" value={phone} />
          <input type="hidden" name="code" value={code} />
          <input type="hidden" name="name" value={name.trim()} />
          <input type="hidden" name="username" value={username.toLowerCase()} />
          <h1 className={styles.title}>رمز ورودت را بساز</h1>
          <p className={styles.lede}>از این به بعد با شماره یا نام کاربری و همین رمز وارد می‌شوی.</p>
          <label className={styles.field}>
            <span className={styles.label}>رمز عبور</span>
            <input name="password" className={styles.input} type="password" autoComplete="new-password" minLength={config.passwordMinLength} maxLength={256} dir="ltr" required autoFocus />
            <span className={styles.hint}>حداقل {fa(config.passwordMinLength)} کاراکتر</span>
          </label>
          <label className={styles.field}>
            <span className={styles.label}>تکرار رمز عبور</span>
            <input name="passwordConfirm" className={styles.input} type="password" autoComplete="new-password" minLength={config.passwordMinLength} maxLength={256} dir="ltr" required />
          </label>
          {registerState.error && <div className={styles.error} role="alert" aria-live="polite">{registerState.error}</div>}
          <AuthSubmit label="ساخت حساب و ورود" pendingLabel="در حال ساخت…" />
          <div className={styles.actionsRow}>
            <button type="button" className={styles.linkButton} onClick={() => setStep(3)}>ویرایش مشخصات</button>
            <button type="button" className={styles.linkButton} onClick={() => setStep(2)}>بررسی دوباره کد</button>
          </div>
        </form>
      )}
    </AuthShell>
  )
}
