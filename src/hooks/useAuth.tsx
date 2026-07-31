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
import { findDevAccount } from '@/data/devAccounts'
import { readJson, remove, writeJson, STORAGE_KEYS } from '@/lib/storage'
import type { User } from '@/types'

interface AuthValue {
  user: User | null
  isLoggedIn: boolean
  /** فقط برای نشست مالک کافه — همان چیزی که `/admin` را می‌بندد. */
  isOwner: boolean
  /** تا وقتی localStorage خوانده نشده false است. */
  ready: boolean
  signIn: (name: string) => void
  /** ورود دمو. نشست را برمی‌گرداند، یا `null` وقتی اطلاعات غلط است. */
  signInWithPassword: (username: string, password: string) => User | null
  signOut: () => void
}

const AuthContext = createContext<AuthValue | null>(null)

/** نشست‌های قدیمی فقط نام دارند؛ به‌عنوان مشتری خوانده می‌شوند نه دور ریخته. */
function parseStoredUser(stored: Partial<User> | null): User | null {
  if (!stored?.name) return null
  return { ...stored, name: stored.name, role: stored.role === 'owner' ? 'owner' : 'customer' }
}

/**
 * وضعیت نشست.
 *
 * ⚠️  بک‌اند واقعی وجود ندارد — گام OTP در `AuthPage` هر کدی را می‌پذیرد.
 * «وارد شده» یعنی صرفاً یک نام و نقش در localStorage ثبت شده. این عمدی است
 * و فاز ۲ نقشه‌ی راه جایگزینش می‌کند (OTP پیامکی + نشست کوکی‌محور).
 *
 * مثل `useSavedCafes`، خواندن در `useEffect` است نه در initializer، وگرنه
 * زیر SSR رندر سرور و کلاینت با هم نمی‌خوانند.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setUser(parseStoredUser(readJson<Partial<User> | null>(STORAGE_KEYS.user, null)))
    setReady(true)
  }, [])

  const signIn = useCallback((name: string) => {
    const next: User = { name: name.trim() || 'نگار احمدی', role: 'customer' }
    writeJson(STORAGE_KEYS.user, next)
    setUser(next)
  }, [])

  const signInWithPassword = useCallback((username: string, password: string) => {
    const account = findDevAccount(username, password)
    if (!account) return null
    const next: User = {
      name: account.name,
      role: account.role,
      username: account.username,
      venue: account.venue,
    }
    writeJson(STORAGE_KEYS.user, next)
    setUser(next)
    return next
  }, [])

  const signOut = useCallback(() => {
    remove(STORAGE_KEYS.user)
    setUser(null)
  }, [])

  const value = useMemo<AuthValue>(
    () => ({
      user,
      isLoggedIn: user !== null,
      isOwner: user?.role === 'owner',
      ready,
      signIn,
      signInWithPassword,
      signOut,
    }),
    [user, ready, signIn, signInWithPassword, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
