'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { requestResetCodeAction, resetPasswordAction } from '@/app/auth/actions'
import { EMPTY_REQUEST_STATE, EMPTY_RESET_PASSWORD_STATE } from '@/app/auth/state'
import { maskPhone } from '@/core/auth/phone'
import { safeAuthRedirect, withAuthRedirect } from '@/core/auth/redirect'
import { fa } from '@/lib/format'
import { paths } from '@/routes'
import { AuthShell, AuthSubmit, type AuthConfig } from './AuthScreen'
import styles from './AuthScreen.module.css'

export function RecoverScreen({ config }: { config: AuthConfig }) {
  const router = useRouter()
  const params = useSearchParams()
  const redirectTo = safeAuthRedirect(params?.get('redirect'), paths.profile)
  const [phone, setPhone] = useState('')
  const codeRef = useRef<HTMLInputElement>(null)
  const [requestState, requestAction] = useActionState(requestResetCodeAction, EMPTY_REQUEST_STATE)
  const [resetState, resetAction] = useActionState(resetPasswordAction, EMPTY_RESET_PASSWORD_STATE)

  useEffect(() => {
    if (requestState.ok && requestState.phone) {
      setPhone(requestState.phone)
      queueMicrotask(() => codeRef.current?.focus())
    }
  }, [requestState])
  useEffect(() => {
    if (!resetState.ok) return
    router.replace(redirectTo)
    router.refresh()
  }, [resetState, redirectTo, router])

  return (
    <AuthShell>
      {!phone ? (
        <form action={requestAction} className={styles.form}>
          <h1 className={styles.title}>بازیابی رمز عبور</h1>
          <p className={styles.lede}>اگر این شماره حساب فعال داشته باشد، کد بازیابی برایش ارسال می‌شود.</p>
          <label className={styles.field}>
            <span className={styles.label}>شماره موبایل حساب</span>
            <input name="phone" className={styles.input} type="tel" inputMode="numeric" autoComplete="tel" placeholder="09151234567" dir="ltr" required autoFocus />
          </label>
          {requestState.error && <div className={styles.error} role="alert">{requestState.error}</div>}
          <AuthSubmit label="دریافت کد بازیابی" pendingLabel="در حال بررسی…" />
          <Link className={styles.linkButton} href={withAuthRedirect(paths.auth, redirectTo)}>بازگشت به ورود</Link>
        </form>
      ) : (
        <form action={resetAction} className={styles.form}>
          <input type="hidden" name="phone" value={phone} />
          <h1 className={styles.title}>رمز جدید</h1>
          <p className={styles.lede}>کد فرستاده‌شده به <b dir="ltr">{maskPhone(phone)}</b> و رمز تازه را وارد کنید. کد فقط {fa(config.otpTtlSeconds)} ثانیه اعتبار دارد.</p>
          {requestState.devMode && <div className={styles.devNote}>حالت توسعه فعال است؛ کد در لاگ امن سرور ثبت شده است.</div>}
          <label className={styles.field}>
            <span className={styles.label}>کد بازیابی</span>
            <input ref={codeRef} name="code" className={`${styles.input} ${styles.codeInput}`} inputMode="numeric" autoComplete="one-time-code" maxLength={config.otpLength} dir="ltr" required />
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
          <AuthSubmit label="ذخیره رمز و ورود" pendingLabel="در حال ذخیره…" />
          <button type="button" className={styles.linkButton} onClick={() => setPhone('')}>تغییر شماره یا ارسال دوباره</button>
        </form>
      )}
    </AuthShell>
  )
}
