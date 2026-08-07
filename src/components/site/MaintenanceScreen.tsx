import Link from 'next/link'
import { paths } from '@/routes'
import styles from './MaintenanceScreen.module.css'
import { Coffee } from 'lucide-react'

/**
 * صفحه‌ی «موقتاً بسته».
 *
 * لینک ورود عمداً می‌ماند: مدیر و کافه‌دار باید بتوانند در حالت تعمیر هم وارد
 * پنلشان شوند. صفحه‌ای که هیچ راه خروجی ندارد، پشتیبانی را هم قطع می‌کند.
 */
export function MaintenanceScreen({
  siteName,
  message,
}: {
  siteName: string
  message: string
}) {
  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <span className={styles.icon} aria-hidden="true">
          <Coffee size={40} strokeWidth={1.6} />
        </span>
        <h1 className={styles.title}>{siteName}</h1>
        <p className={styles.message}>{message}</p>
        <Link href={paths.auth} className={styles.link}>
          ورود مدیران و کافه‌داران
        </Link>
      </div>
    </div>
  )
}

export default MaintenanceScreen
