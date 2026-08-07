import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { TasteQuiz } from '@/components/profile/TasteQuiz'
import { getCurrentUser } from '@/core/auth/currentUser'
import { getTasteProfile } from '@/core/user/userData'
import { authUrl, paths } from '@/routes'
import styles from '../page.module.css'
import { ArrowLeft } from 'lucide-react'

export const metadata: Metadata = {
  title: 'سلیقه‌سنجی',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default async function TastePage() {
  const user = await getCurrentUser()
  if (!user) redirect(authUrl(paths.taste))

  const taste = await getTasteProfile(user.id)

  return (
    <div className={styles.page}>
      <Link href={paths.profile} className={styles.backLink}>
        <ArrowLeft size={15} aria-hidden="true" /> پنل من
      </Link>
      <h1 className={styles.title}>سلیقه‌ی تو</h1>
      <p className={styles.lede}>
        شش سؤال کوتاه. جواب‌ها فقط برای مرتب‌کردن پیشنهادهای خودت استفاده می‌شوند و
        جایی نمایش داده نمی‌شوند.
      </p>

      <TasteQuiz initial={taste?.answers ?? {}} />
    </div>
  )
}
