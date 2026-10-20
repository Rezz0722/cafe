'use client'

import { useActionState, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { requestResetCodeAction, resetPasswordAction } from '@/app/auth/actions'
import { EMPTY_REQUEST_STATE, EMPTY_RESET_PASSWORD_STATE } from '@/app/auth/state'
import { maskPhone } from '@/core/auth/phone'
import { safeAuthRedirect, withAuthRedirect } from '@/core/auth/redirect'
import { fa } from '@/lib/format'
import { toAsciiDigits } from '@/core/text/normalize'
import { useOtpChallenge } from '@/hooks/useOtpChallenge'
import { useWebOtp } from '@/hooks/useWebOtp'
import { OtpTiming } from './OtpTiming'
import { paths } from '@/routes'
import { AuthShell, AuthSubmit, type AuthConfig } from './AuthScreen'
import styles from './AuthScreen.module.css'

export function RecoverScreen({ config }: { config: AuthConfig }) {
  const router = useRouter()
  const params = useSearchParams()
  const redirectTo = safeAuthRedirect(params?.get('redirect'), paths.profile)
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [requestState, requestAction, requestPending] = useActionState(requestResetCodeAction, EMPTY_REQUEST_STATE)
  const { challenge, codeRemaining, resendRemaining, expired, reset } = useOtpChallenge('reset_password', requestState)
  const { start: startWebOtp, stop: stopWebOtp, restore: restoreWebOtp } = useWebOtp(config.otpLength, setCode)
  const prepareRequest = () => { setCode(''); startWebOtp() }
  useEffect(() => { if (challenge?.phone && !expired) restoreWebOtp() }, [challenge?.phone, expired, restoreWebOtp])
  const [resetState, resetAction] = useActionState(resetPasswordAction, EMPTY_RESET_PASSWORD_STATE)

  useEffect(() => {
    if (challenge?.ok && challenge.phone) {
      setPhone(challenge.phone)
    }
  }, [challenge])
  useEffect(() => {
    if (!resetState.ok) return
    router.replace(redirectTo)
    router.refresh()
  }, [resetState, redirectTo, router])

  return (
    <AuthShell>
      {challenge && <OtpTiming remaining={codeRemaining} resendRemaining={resendRemaining} />}
      {challenge && <form action={requestAction} onSubmit={prepareRequest} className={styles.form} aria-label="ارسال دوبارهٔ کد بازیابی">
        <input type="hidden" name="phone" value={phone} />
        {requestState.error && <div role="alert" className={styles.error}>{requestState.error}</div>}
        <AuthSubmit label={resendRemaining > 0 ? `ارسال مجدد تا ${fa(resendRemaining)} ثانیهٔ دیگر` : 'ارسال دوبارهٔ کد'} pendingLabel="در حال ارسال…" disabled={resendRemaining > 0} />
      </form>}
      {!phone ? (
        <form action={requestAction} onSubmit={prepareRequest} className={styles.form}>
          <h1 className={styles.title}>بازیابی رمز عبور</h1>
          <p className={styles.lede}>اگر این شماره حساب فعال داشته باشد، کد بازیابی برایش ارسال می‌شود.</p>
          <label className={styles.field}>
            <span className={styles.label}>شماره موبایل حساب</span>
            <input name="phone" className={styles.input} type="tel" inputMode="numeric" autoComplete="tel" placeholder="09151234567" dir="ltr" required autoFocus />
          </label>
          {requestState.error && <div className={styles.error} role="alert">{requestState.error}</div>}
          <AuthSubmit label="دریافت کد بازیابی" pendingLabel="در حال بررسی…" />
          <Link className={styles.linkButton} href={`${withAuthRedirect(paths.auth, redirectTo)}&mode=login`}>بازگشت به ورود</Link>
        </form>
      ) : (
        <form action={resetAction} className={styles.form}>
          <input type="hidden" name="redirectTo" value={redirectTo} />
          <input type="hidden" name="phone" value={phone} />
          <input type="hidden" name="challengeId" value={challenge?.challengeId ?? ''} />
          <h1 className={styles.title}>رمز جدید</h1>
          <p className={styles.lede}>کد فرستاده‌شده به <b dir="ltr">{maskPhone(phone)}</b> و رمز تازه را وارد کنید. کد فقط {fa(config.otpTtlSeconds)} ثانیه اعتبار دارد.</p>
          {requestState.devMode && <div className={styles.devNote}>حالت توسعه فعال است؛ کد در لاگ امن سرور ثبت شده است.</div>}
          <label className={styles.field}>
            <span className={styles.label}>کد بازیابی</span>
            <input value={code} onChange={event => setCode(toAsciiDigits(event.target.value).replace(/\D/g, '').slice(0, config.otpLength))} autoFocus name="code" className={`${styles.input} ${styles.codeInput}`} inputMode="numeric" autoComplete="one-time-code" maxLength={config.otpLength} dir="ltr" required />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>رمز جدید</span>
            <input name="password" className={styles.input} type="password" autoComplete="new-password" minLength={config.passwordMinLength} maxLength={256} dir="ltr" required />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>تکرار رمز جدید</span>
            <input name="passwordConfirm" className={styles.input} type="password" autoComplete="new-password" minLength={config.passwordMinLength} maxLength={256} dir="ltr" required />
          </label>
          {resetState.error && <div className={styles.error} role="alert" aria-live="polite">{resetState.error}</div>}
          <AuthSubmit label="ذخیره رمز و ورود" pendingLabel="در حال ذخیره…" disabled={expired || requestPending} />
          <button type="button" className={styles.linkButton} onClick={async () => { stopWebOtp(); await reset(); setPhone(''); setCode('') }}>تغییر شماره یا ارسال دوباره</button>
        </form>
      )}
    </AuthShell>
  )
}
