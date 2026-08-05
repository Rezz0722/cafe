'use client'

/**
 * فرم تغییر یا تنظیم رمز.
 *
 * ═══ چرا «رمز فعلی» شرطی است ═══
 *
 * کاربری که با کد پیامکی وارد شده و هیچ رمزی ندارد، رمز فعلی هم ندارد که
 * بنویسد. اجباری‌کردنش یعنی او هرگز نمی‌تواند رمز بگذارد — و همان کاربر
 * است که وقتی سرویس پیامک قطع شود، دیگر نمی‌تواند وارد شود.
 */

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { changePasswordAction } from '@/app/auth/actions'
import { EMPTY_CHANGE_PASSWORD_STATE } from '@/app/auth/state'
import styles from './SubmitPlaceForm.module.css'

function SaveButton({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className={styles.submit} disabled={pending}>
      {pending ? 'در حال ذخیره…' : label}
    </button>
  )
}

export function ChangePasswordForm({
  hasPassword,
  mustChange,
}: {
  hasPassword: boolean
  mustChange: boolean
}) {
  const [state, action] = useActionState(changePasswordAction, EMPTY_CHANGE_PASSWORD_STATE)

  return (
    <form action={action} className={styles.form}>
      {mustChange && (
        <p className={styles.error}>
          رمز فعلی‌تان موقتی است و مدیر آن را صادر کرده. تا عوضش نکنید، هر بار
          به این صفحه برمی‌گردید.
        </p>
      )}
      {state.ok && <p className={styles.success}>رمز عبور عوض شد.</p>}
      {state.error && <p className={styles.error}>{state.error}</p>}

      {hasPassword && (
        <label className={styles.field}>
          <span className={styles.label}>رمز فعلی</span>
          <input
            name="currentPassword"
            className={styles.input}
            type="password"
            autoComplete="current-password"
            dir="ltr"
            required
          />
        </label>
      )}

      <label className={styles.field}>
        <span className={styles.label}>رمز جدید</span>
        <input
          name="newPassword"
          className={styles.input}
          type="password"
          autoComplete="new-password"
          dir="ltr"
          minLength={8}
          required
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>تکرار رمز جدید</span>
        <input
          name="newPasswordConfirm"
          className={styles.input}
          type="password"
          autoComplete="new-password"
          dir="ltr"
          minLength={8}
          required
        />
      </label>

      <p className={styles.hint}>حداقل ۸ کاراکتر.</p>

      <SaveButton label={hasPassword ? 'تغییر رمز' : 'تنظیم رمز'} />
    </form>
  )
}

export default ChangePasswordForm
