import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { CAFES } from '@/data/cafes'
import { readRaw, writeRaw, STORAGE_KEYS } from '@/lib/storage'

interface SavedValue {
  saved: Set<string>
  isSaved: (id: string) => boolean
  toggle: (id: string) => void
  unsave: (id: string) => void
  count: number
}

const SavedContext = createContext<SavedValue | null>(null)

function readSaved(): Set<string> {
  const ids = CAFES.filter((c) => readRaw(STORAGE_KEYS.savedPrefix + c.id) === '1').map((c) => c.id)
  return new Set(ids)
}

/** Bookmarked venues, persisted one localStorage key per venue. */
export function SavedCafesProvider({ children }: { children: ReactNode }) {
  const [saved, setSaved] = useState<Set<string>>(readSaved)

  const write = useCallback((id: string, on: boolean) => {
    writeRaw(STORAGE_KEYS.savedPrefix + id, on ? '1' : '0')
  }, [])

  const toggle = useCallback(
    (id: string) => {
      setSaved((prev) => {
        const next = new Set(prev)
        const on = !next.has(id)
        if (on) next.add(id)
        else next.delete(id)
        write(id, on)
        return next
      })
    },
    [write],
  )

  const unsave = useCallback(
    (id: string) => {
      setSaved((prev) => {
        if (!prev.has(id)) return prev
        const next = new Set(prev)
        next.delete(id)
        write(id, false)
        return next
      })
    },
    [write],
  )

  const value = useMemo<SavedValue>(
    () => ({
      saved,
      isSaved: (id: string) => saved.has(id),
      toggle,
      unsave,
      count: saved.size,
    }),
    [saved, toggle, unsave],
  )

  return <SavedContext.Provider value={value}>{children}</SavedContext.Provider>
}

export function useSavedCafes(): SavedValue {
  const ctx = useContext(SavedContext)
  if (!ctx) throw new Error('useSavedCafes must be used inside <SavedCafesProvider>')
  return ctx
}
