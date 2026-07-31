'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { readJson, writeJson, STORAGE_KEYS } from '@/lib/storage'

interface SavedValue {
  saved: Set<string>
  isSaved: (slug: string) => boolean
  toggle: (slug: string) => void
  unsave: (slug: string) => void
  count: number
  /** تا وقتی localStorage خوانده نشده false است — برای جلوگیری از پرش UI. */
  ready: boolean
}

const SavedContext = createContext<SavedValue | null>(null)

/**
 * ذخیره‌ی کافه‌ها.
 *
 * ═══ دو تغییر نسبت به نسخه‌ی SPA ═══
 *
 * ۱. خواندن از localStorage به `useEffect` منتقل شد. قبلاً داخل
 *    `useState(readSaved)` بود که زیر SSR باعث hydration mismatch می‌شود:
 *    سرور با مجموعه‌ی خالی رندر می‌کند و کلاینت با داده، و React اعتراض
 *    می‌کند. حالا رندر اول در هر دو طرف یکسان است.
 *
 * ۲. یک کلید آرایه‌ای به‌جای یک کلید در ازای هر کافه. نسخه‌ی قبلی برای
 *    خواندن، روی *کل کاتالوگ* حلقه می‌زد تا ببیند کدام ذخیره شده — که با
 *    ۳۰۰ کافه یعنی ۳۰۰ بار خواندن localStorage در هر بارگذاری صفحه.
 */
export function SavedCafesProvider({ children }: { children: ReactNode }) {
  const [saved, setSaved] = useState<Set<string>>(() => new Set())
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const stored = readJson<string[]>(STORAGE_KEYS.saved, [])
    if (Array.isArray(stored) && stored.length) setSaved(new Set(stored))
    setReady(true)
  }, [])

  const persist = useCallback((next: Set<string>) => {
    writeJson(STORAGE_KEYS.saved, [...next])
  }, [])

  const toggle = useCallback(
    (slug: string) => {
      setSaved((prev) => {
        const next = new Set(prev)
        if (next.has(slug)) next.delete(slug)
        else next.add(slug)
        persist(next)
        return next
      })
    },
    [persist],
  )

  const unsave = useCallback(
    (slug: string) => {
      setSaved((prev) => {
        if (!prev.has(slug)) return prev
        const next = new Set(prev)
        next.delete(slug)
        persist(next)
        return next
      })
    },
    [persist],
  )

  const value = useMemo<SavedValue>(
    () => ({
      saved,
      isSaved: (slug: string) => saved.has(slug),
      toggle,
      unsave,
      count: saved.size,
      ready,
    }),
    [saved, toggle, unsave, ready],
  )

  return <SavedContext.Provider value={value}>{children}</SavedContext.Provider>
}

export function useSavedCafes(): SavedValue {
  const ctx = useContext(SavedContext)
  if (!ctx) throw new Error('useSavedCafes must be used inside <SavedCafesProvider>')
  return ctx
}
