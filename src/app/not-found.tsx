import Link from 'next/link'
import { Coffee } from 'lucide-react'
import { paths } from '@/routes'
import styles from './not-found.module.css'

/**
 * صفحه‌ی ۴۰۴.
 *
 * هدر و فوتر اینجا رندر نمی‌شوند — از `layout` ریشه می‌آیند، مثل بقیه‌ی صفحات.
 * قبلاً این فایل خودش هر دو را رندر می‌کرد؛ بعد از انتقالشان به layout، دو هدر
 * روی هم می‌افتاد.
 */

export default function NotFound() {
  return (
    <main className={styles.wrap}>
      <div className={styles.icon} aria-hidden="true">
        <Coffee size={44} strokeWidth={1.6} />
      </div>
      <h1 className={styles.title}>این صفحه پیدا نشد</h1>
      <p className={styles.text}>
        شاید کافه‌ای که دنبالش بودی جابه‌جا شده یا هنوز ثبت نشده.
      </p>
      <div className={styles.actions}>
        <Link href={paths.home} className={styles.primary}>
          بازگشت به صفحهٔ اصلی
        </Link>
        <Link href={paths.search} className={styles.secondary}>
          جست‌وجوی کافه‌ها
        </Link>
      </div>
    </main>
  )
}
