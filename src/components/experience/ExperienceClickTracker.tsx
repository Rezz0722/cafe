'use client'

import { useEffect } from 'react'

/**
 * ثبت کلیک با event delegation؛ کارت‌ها server component می‌مانند و برای هر
 * کارت یک handler و bundle جدا به مرورگر فرستاده نمی‌شود.
 */
export function ExperienceClickTracker() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element
        ? event.target.closest<HTMLElement>('[data-experience-track]')
        : null
      if (!target) return

      const payload = JSON.stringify({
        event: target.dataset.experienceTrack,
        experience: target.dataset.experienceSlug,
        resultCount: Number(target.dataset.experienceCount ?? 0),
        placeId: Number(target.dataset.experiencePlaceId ?? 0) || null,
        rank: Number(target.dataset.experienceRank ?? 0) || null,
      })
      try {
        if (navigator.sendBeacon) {
          navigator.sendBeacon('/api/experience-track', new Blob([payload], { type: 'application/json' }))
        } else {
          void fetch('/api/experience-track', {
            method: 'POST',
            body: payload,
            headers: { 'Content-Type': 'application/json' },
            keepalive: true,
          })
        }
      } catch {
        // تحلیل رفتار نباید هیچ‌وقت جلوی ناوبری را بگیرد.
      }
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

  return null
}
