import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { DeactivateAccountForm } from '@/components/profile/DeactivateAccountForm'
import { getSession } from '@/core/auth/currentUser'
import { authUrl, paths } from '@/routes'
import styles from '../page.module.css'

export const metadata: Metadata = { title: 'امنیت حساب', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function SecurityPage() {
  const { user, actor } = await getSession()
  if (!user) redirect(authUrl(paths.accountSecurity))
  if (actor) redirect(paths.profile)
  return (
    <main className={styles.page}>
      <Link href={paths.profile} className={styles.backLink}>بازگشت به پنل من</Link>
      <h1 className={styles.title}>امنیت حساب</h1>
      <p className={styles.lede}>غیرفعال‌سازی حساب برگشت خودکار ندارد و برای فعال‌سازی دوباره باید با پشتیبانی تماس بگیرید.</p>
      <DeactivateAccountForm />
    </main>
  )
}
