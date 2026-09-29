'use client'

import { useEffect } from 'react'
import styles from './search/SearchStates.module.css'

const RELOAD_KEY = 'kucafe-version-skew-reload-at'
const RELOAD_COOLDOWN_MS = 60_000

function isVersionSkew(error: Error): boolean {
  return /Server Action.+not found|Failed to find Server Action|older or newer deployment|ChunkLoadError|Loading chunk/i.test(error.message)
}

export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const staleVersion = isVersionSkew(error)

  useEffect(() => {
    console.error('[app] client render failed', error)
    if (!staleVersion) return

    try {
      const lastReload = Number(sessionStorage.getItem(RELOAD_KEY) || 0)
      if (Date.now() - lastReload < RELOAD_COOLDOWN_MS) return
      sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
      window.location.reload()
    } catch {
      // دسترسی به storage ممکن است در حالت خصوصی بسته باشد؛ دکمهٔ پایین
      // همچنان بازیابی دستی را ممکن می‌کند و از حلقهٔ reload جلوگیری می‌شود.
    }
  }, [error, staleVersion])

  return (
    <main className={styles.state} aria-labelledby="app-error-title">
      <h1 id="app-error-title">{staleVersion ? 'نسخهٔ تازهٔ کوکافه آماده است' : 'این صفحه درست بار نشد'}</h1>
      <p role="alert">
        {staleVersion
          ? 'صفحه‌ای که باز بود متعلق به نسخهٔ قبلی است. با بارگذاری نسخهٔ تازه می‌توانید ادامه دهید.'
          : 'اطلاعات شما حذف نشده است. چند لحظه بعد دوباره تلاش کنید.'}
      </p>
      <button type="button" onClick={() => { if (staleVersion) window.location.reload(); else reset() }}>
        {staleVersion ? 'بارگذاری نسخهٔ تازه' : 'تلاش دوباره'}
      </button>
    </main>
  )
}
