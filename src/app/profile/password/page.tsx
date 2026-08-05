import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChangePasswordForm } from '@/components/profile/ChangePasswordForm'
import { getCurrentUser } from '@/core/auth/currentUser'
import { findUserById } from '@/core/auth/userRepo'
import { authUrl, paths } from '@/routes'
import styles from '../page.module.css'

export const metadata: Metadata = {
  title: 'رمز عبور — کافه‌گرد',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default async function PasswordPage() {
  const user = await getCurrentUser()
  if (!user) redirect(authUrl(paths.changePassword))

  const account = await findUserById(user.id)
  const hasPassword = !!account?.passwordHash

  return (
    <div className={styles.page}>
      <Link href={paths.profile} className={styles.backLink}>
        ← پنل من
      </Link>
      <h1 className={styles.title}>{hasPassword ? 'تغییر رمز عبور' : 'تنظیم رمز عبور'}</h1>
      <p className={styles.lede}>
        {hasPassword
          ? 'با رمز عبور می‌توانی بدون کد پیامکی وارد شوی.'
          : 'اگر رمز بگذاری، حتی وقتی سرویس پیامک در دسترس نباشد هم می‌توانی وارد شوی. ورود با کد پیامکی هم به کار خودش ادامه می‌دهد.'}
      </p>

      <ChangePasswordForm
        hasPassword={hasPassword}
        mustChange={account?.mustChangePassword ?? false}
      />
    </div>
  )
}
