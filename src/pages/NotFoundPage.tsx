import { Link } from 'react-router-dom'
import { MobileShell, shellStyles } from '@/components/layout/MobileShell'
import { paths } from '@/routes'
// The 404 is the same centred phone column as the auth steps, so it borrows
// that stylesheet instead of duplicating it.
import styles from './AuthPage.module.css'

export function NotFoundPage() {
  return (
    <MobileShell>
      <div className={styles.screen}>
        <div className={`${styles.center} ${styles.notFound}`}>
          <h1 className={styles.title}>این‌جا کافه‌ای نیست ☕</h1>
          <p className={styles.lede}>صفحه‌ای که دنبالش بودی پیدا نشد.</p>
          <Link
            to={paths.home}
            className={`${shellStyles.primaryButton} ${styles.homeLink}`}
          >
            برگرد به صفحهٔ اصلی
          </Link>
        </div>
      </div>
    </MobileShell>
  )
}
