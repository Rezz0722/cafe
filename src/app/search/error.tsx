'use client'

import { useEffect } from 'react'
import styles from './SearchStates.module.css'

export default function SearchError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[search] render failed', error)
  }, [error])

  return (
    <main className={styles.state}>
      <h1>نتیجه‌ها بار نشدند</h1>
      <p>
        اتصال اینترنت یا سرویس جست‌وجو موقتاً در دسترس نیست. فیلترهای شما در آدرس
        صفحه حفظ شده‌اند و با تلاش دوباره از بین نمی‌روند.
      </p>
      <button type="button" onClick={reset}>تلاش دوباره</button>
    </main>
  )
}
