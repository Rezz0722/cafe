'use client'

import styles from './updates.module.css'

export default function AccountUpdatesError({ reset }: { error: Error; reset: () => void }) {
  return <main className={styles.page}>
    <header><h1>به‌روزرسانی‌ها فعلاً در دسترس نیست</h1><p role="alert">اکنون نمی‌توانیم آخرین وضعیت درخواست‌ها را نشان دهیم؛ کمی بعد دوباره تلاش کنید.</p></header>
    <button className={styles.retry} type="button" onClick={reset}>تلاش دوباره</button>
  </main>
}
