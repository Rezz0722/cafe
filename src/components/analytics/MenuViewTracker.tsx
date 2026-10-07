'use client'
import { useEffect, useRef } from 'react'
import { MENU_VIEW_WINDOW } from '@/core/analytics/menuPolicy'
const recent = new Map<string, number>()
export function MenuViewTracker({ placeId, targetId, kind, enabled = true }: { placeId: number; targetId: number; kind: 'section' | 'item'; enabled?: boolean }) {
  const marker = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!enabled || navigator.doNotTrack === '1' || (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl) return
    const target = marker.current?.parentElement
    if (!target || typeof IntersectionObserver === 'undefined') return
    const key = `kucafe-menu:${placeId}:${kind}:${targetId}`
    let visible = false, sent = false, timer: ReturnType<typeof setTimeout> | undefined
    const stop = () => { clearTimeout(timer); timer = undefined }
    const start = () => {
      stop()
      if (!visible || sent || document.visibilityState !== 'visible') return
      timer = setTimeout(() => {
        const now = Date.now()
        let expiry = recent.get(key) || 0
        try { expiry = Math.max(expiry, Number(sessionStorage.getItem(key)) || 0) } catch { /* in-memory fallback */ }
        if (expiry > now) { sent = true; return }
        const eventId = crypto.randomUUID()
        sent = true
        void fetch('/api/track/menu', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ placeId, targetId, kind, eventId }), credentials: 'omit', keepalive: true })
          .then(response => {
            if (!response.ok) return
            if (recent.size >= 500) recent.delete(recent.keys().next().value!)
            recent.set(key, now + MENU_VIEW_WINDOW)
            try {
              const keys = Object.keys(sessionStorage).filter(k => k.startsWith('kucafe-menu:'))
              for (const k of keys) if (Number(sessionStorage.getItem(k)) <= now) sessionStorage.removeItem(k)
              if (keys.length >= 500) sessionStorage.removeItem(keys[0]!)
              sessionStorage.setItem(key, String(now + MENU_VIEW_WINDOW))
            } catch { /* private browsing/storage restrictions */ }
          }).catch(() => { /* best-effort; no menu disruption */ })
      }, 1000)
    }
    const observer = new IntersectionObserver(entries => { visible = entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= 0.1); start() }, { threshold: 0.1 })
    observer.observe(target)
    document.addEventListener('visibilitychange', start)
    return () => { stop(); observer.disconnect(); document.removeEventListener('visibilitychange', start) }
  }, [enabled, kind, placeId, targetId])
  return <span ref={marker} hidden aria-hidden="true" />
}
