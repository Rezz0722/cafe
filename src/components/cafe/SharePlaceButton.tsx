'use client'

import { useState } from 'react'
import { Check, Share2 } from 'lucide-react'
import styles from './SharePlaceButton.module.css'

export function SharePlaceButton({ name }: { name: string }) {
  const [copied, setCopied] = useState(false)

  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({ title: name, url: window.location.href })
        return
      }
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2200)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setCopied(false)
    }
  }

  return (
    <button type="button" className={styles.button} onClick={share} aria-live="polite" aria-label={copied?'لینک کپی شد':'اشتراک‌گذاری کافه'} title="اشتراک‌گذاری">
      {copied ? <Check size={18} aria-hidden="true" /> : <Share2 size={18} aria-hidden="true" />}
    </button>
  )
}
