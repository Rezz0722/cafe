import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { readJson, remove, writeJson, STORAGE_KEYS } from '@/lib/storage'
import type { User } from '@/types'

interface AuthValue {
  user: User | null
  isLoggedIn: boolean
  signIn: (name: string) => void
  signOut: () => void
}

const AuthContext = createContext<AuthValue | null>(null)

/**
 * Session state, persisted to localStorage. There is no backend yet — the OTP
 * flow in `AuthProfilePage` accepts any code — so "signed in" means nothing more
 * than a name being on record.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() =>
    readJson<User | null>(STORAGE_KEYS.user, null),
  )

  const signIn = useCallback((name: string) => {
    const next: User = { name: name.trim() || 'نگار احمدی' }
    writeJson(STORAGE_KEYS.user, next)
    setUser(next)
  }, [])

  const signOut = useCallback(() => {
    remove(STORAGE_KEYS.user)
    setUser(null)
  }, [])

  const value = useMemo<AuthValue>(
    () => ({ user, isLoggedIn: user !== null, signIn, signOut }),
    [user, signIn, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
