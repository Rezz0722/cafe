import { signOutAction } from '@/app/auth/actions'
import styles from './SignOutButton.module.css'

/**
 * خروج از حساب.
 *
 * server component با یک `<form>` روی server action — بدون جاوااسکریپت سمت
 * کلاینت هم کار می‌کند، که برای دکمه‌ی خروج مهم است: اگر جاوااسکریپت بشکند،
 * کاربر نباید در حسابش گیر بیفتد.
 */
export function SignOutButton() {
  return (
    <form action={signOutAction}>
      <button type="submit" className={styles.button}>
        خروج
      </button>
    </form>
  )
}

export default SignOutButton
