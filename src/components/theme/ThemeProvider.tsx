'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { isThemeMode, resolveTheme, THEME_STORAGE_KEY, type ResolvedTheme, type ThemeMode } from '@/core/theme/theme'

interface ThemeContextValue {
  mode: ThemeMode
  resolvedTheme: ResolvedTheme
  setMode: (mode: ThemeMode) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function initialMode(): ThemeMode {
  if (typeof document === 'undefined') return 'auto'
  const value = document.documentElement.dataset.themeMode
  return isThemeMode(value) ? value : 'auto'
}

function initialResolved(): ResolvedTheme {
  if (typeof document === 'undefined') return 'light'
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}

function systemTheme(): ResolvedTheme {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(mode: ThemeMode, resolved: ResolvedTheme) {
  const root = document.documentElement
  root.dataset.themeMode = mode
  root.dataset.theme = resolved
  root.style.colorScheme = resolved
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (!meta) {
    meta = document.createElement('meta')
    meta.name = 'theme-color'
    document.head.appendChild(meta)
  }
  meta.content = resolved === 'dark' ? '#101722' : '#fffdfa'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setStoredMode] = useState<ThemeMode>(initialMode)
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(initialResolved)

  const refresh = useCallback((nextMode: ThemeMode) => {
    const nextTheme = resolveTheme(nextMode, systemTheme())
    setResolvedTheme(nextTheme)
    applyTheme(nextMode, nextTheme)
  }, [])

  const setMode = useCallback((nextMode: ThemeMode) => {
    setStoredMode(nextMode)
    try { localStorage.setItem(THEME_STORAGE_KEY, nextMode) } catch { /* Storage can be disabled. */ }
    refresh(nextMode)
  }, [refresh])

  useEffect(() => {
    refresh(mode)
    if (mode !== 'auto') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const update = () => refresh('auto')
    media.addEventListener?.('change', update)
    document.addEventListener('visibilitychange', update)
    window.addEventListener('focus', update)
    return () => {
      media.removeEventListener?.('change', update)
      document.removeEventListener('visibilitychange', update)
      window.removeEventListener('focus', update)
    }
  }, [mode, refresh])

  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY || !isThemeMode(event.newValue)) return
      setStoredMode(event.newValue)
      refresh(event.newValue)
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [refresh])

  const value = useMemo(() => ({ mode, resolvedTheme, setMode }), [mode, resolvedTheme, setMode])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext)
  if (!value) throw new Error('useTheme must be used inside ThemeProvider')
  return value
}
