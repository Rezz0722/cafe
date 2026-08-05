'use client'

/**
 * ثبت بازدید در هر تغییر مسیر.
 *
 * ═══ چرا `sendBeacon` و نه `fetch` ═══
 *
 * `sendBeacon` درخواست را به صف مرورگر می‌دهد و **حتی اگر کاربر بلافاصله
 * صفحه را ببندد** فرستاده می‌شود. با `fetch` معمولی، بازدیدِ کسی که سریع
 * می‌رود گم می‌شود — و آن‌ها دقیقاً کسانی هستند که باید بدانیم چرا رفتند.
 *
 * ═══ چرا `usePathname` و نه یک بار در mount ═══
 *
 * ناوبری در App Router صفحه را از نو بار نمی‌کند، پس `useEffect` بی‌وابستگی
 * فقط بازدید اول را می‌گیرد و بقیه‌ی مسیرها هرگز ثبت نمی‌شوند.
 */

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

export function PageViewTracker() {
  const pathname = usePathname()
  const lastSent = useRef<string | null>(null)

  useEffect(() => {
    if (!pathname) return
    // در حالت توسعه، React دو بار effect را اجرا می‌کند (StrictMode) و
    // بدون این نگهبان، هر بازدید دو بار ثبت می‌شد.
    if (lastSent.current === pathname) return
    lastSent.current = pathname

    const payload = JSON.stringify({
      path: pathname,
      // مرجع فقط وقتی فرستاده می‌شود که از بیرونِ سایت آمده باشد؛ مسیرِ
      // داخلی در گزارش «از کجا آمدند» فقط نویز است.
      referrer:
        typeof document !== 'undefined' &&
        document.referrer &&
        !document.referrer.startsWith(window.location.origin)
          ? document.referrer
          : null,
    })

    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/track', new Blob([payload], { type: 'application/json' }))
      } else {
        void fetch('/api/track', {
          method: 'POST',
          body: payload,
          headers: { 'Content-Type': 'application/json' },
          keepalive: true,
        })
      }
    } catch {
      // ثبت آمار هرگز نباید تجربه‌ی کاربر را خراب کند.
    }
  }, [pathname])

  return null
}

export default PageViewTracker
