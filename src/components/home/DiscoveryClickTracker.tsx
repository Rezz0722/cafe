'use client'

import { useEffect } from 'react'

/** One delegated click listener, so Server Component cards stay lightweight. */
export function DiscoveryClickTracker() {
  useEffect(() => {
    let lastKey = ''
    let lastAt = 0
    const onClick = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null
      const tagged = anchor?.closest<HTMLElement>('[data-discovery-event]')
      if (!anchor || !tagged) return
      const payload = JSON.stringify({
        event: tagged.dataset.discoveryEvent,
        source: tagged.dataset.discoverySource,
        context: tagged.dataset.discoveryContext,
      })
      const now = Date.now()
      if (payload === lastKey && now - lastAt < 900) return
      lastKey = payload
      lastAt = now
      try {
        if (navigator.sendBeacon) navigator.sendBeacon('/api/discovery-track', new Blob([payload], { type: 'application/json' }))
        else void fetch('/api/discovery-track', { method: 'POST', body: payload, headers: { 'Content-Type': 'application/json' }, keepalive: true })
      } catch { /* Navigation must never depend on optional analytics. */ }
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])
  return null
}
