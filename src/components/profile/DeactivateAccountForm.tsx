'use client'

import { useActionState, useEffect } from 'react'
import { useFormStatus } from 'react-dom'
import { useRouter } from 'next/navigation'
import { deactivateAccountAction } from '@/app/auth/actions'
import { EMPTY_DEACTIVATE_ACCOUNT_STATE } from '@/app/auth/state'
import { paths } from '@/routes'
import styles from './SubmitPlaceForm.module.css'

function Button() {
  const { pending } = useFormStatus()
  return <button type="submit" className={styles.submit} disabled={pending}>{pending ? 'در حال غیرفعال‌سازی…' : 'غیرفعال‌کردن حساب'}</button>
}

export function DeactivateAccountForm() {
  const router = useRouter()
  const [state, action] = useActionState(deactivateAccountAction, EMPTY_DEACTIVATE_ACCOUNT_STATE)
  useEffect(() => {
    if (!state.ok) return
    router.replace(paths.home)
    router.refresh()
  }, [state.ok, router])

  return (
    <form action={action} className={styles.form}>
      <p className={styles.hint}>با این کار همه نشست‌ها فوراً باطل و ورود حساب متوقف می‌شود. داده‌های عمومی و نظرها حذف نمی‌شوند.</p>
      <label className={styles.field}>
        <span className={styles.label}>رمز عبور فعلی</span>
        <input name="password" className={styles.input} type="password" autoComplete="current-password" maxLength={256} dir="ltr" required />
      </label>
      <label className={styles.field}>
        <span className={styles.label}>برای تأیید بنویسید «غیرفعال‌سازی حساب»</span>
        <input name="confirmation" className={styles.input} autoComplete="off" required />
      </label>
      {state.error && <p className={styles.error} role="alert">{state.error}</p>}
      <Button />
    </form>
  )
}
