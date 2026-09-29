'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Moon, Sun, SunMoon } from 'lucide-react'
import type { ThemeMode } from '@/core/theme/theme'
import { useTheme } from './ThemeProvider'
import styles from './ThemeSwitcher.module.css'

const OPTIONS: { value: ThemeMode; label: string; hint: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'حالت روشن', hint: 'همیشه روشن', icon: Sun },
  { value: 'dark', label: 'حالت تاریک', hint: 'همیشه تاریک', icon: Moon },
  { value: 'auto', label: 'خودکار', hint: 'هماهنگ با تنظیمات دستگاه', icon: SunMoon },
]

export function ThemeSwitcher() {
  const { mode, resolvedTheme, setMode } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelId = useId()
  const selected = OPTIONS.find(option => option.value === mode)!

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      triggerRef.current?.focus()
    }
    document.addEventListener('pointerdown', closeOutside)
    window.addEventListener('keydown', closeWithEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      window.removeEventListener('keydown', closeWithEscape)
    }
  }, [open])

  return (
    <div ref={rootRef} className={styles.root}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-label={mounted ? `تنظیم ظاهر سایت؛ ${selected.label}` : 'تنظیم ظاهر سایت'}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(value => !value)}
      >
        {mounted && resolvedTheme === 'dark' ? <Moon size={18} aria-hidden="true" /> : <SunMoon size={18} aria-hidden="true" />}
        <span>{mounted ? selected.label : 'ظاهر سایت'}</span>
      </button>
      {open && (
        <div id={panelId} className={styles.panel} role="group" aria-label="انتخاب ظاهر سایت">
          <strong>ظاهر کوکافه</strong>
          {OPTIONS.map(option => {
            const Icon = option.icon
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={mode === option.value}
                onClick={() => { setMode(option.value); setOpen(false); triggerRef.current?.focus() }}
              >
                <Icon size={19} aria-hidden="true" />
                <span><b>{option.label}</b><small>{option.hint}</small></span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
