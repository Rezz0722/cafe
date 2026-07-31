'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { isAdmin, isOwner, type SessionUser } from '@/core/auth/types'

interface AuthValue {
  user: SessionUser | null
  isLoggedIn: boolean
  /** مالک یا ادمین — همان چیزی که پنل `/admin/venue` را باز می‌کند. */
  isOwner: boolean
  isAdmin: boolean
}

const AuthContext = createContext<AuthValue | null>(null)

/**
 * نشست، فقط‌خواندنی.
 *
 * ═══ چرا دیگر localStorage نیست ═══
 *
 * نسخه‌ی قبلی نشست را خودش می‌ساخت و در localStorage می‌گذاشت — یعنی هرکس با
 * یک خط جاوااسکریپت در کنسول می‌توانست نقش خودش را «owner» کند. حالا منبع
 * حقیقت کوکی امضاشده‌ی سرور است و این context فقط همان چیزی را پخش می‌کند که
 * layout سرور با `getCurrentUser()` خوانده.
 *
 * به همین دلیل هیچ `signIn`/`signOut`ی اینجا نیست: ورود و خروج server action
 * هستند (`src/app/auth/actions.ts`) و نتیجه‌شان با رفرش مسیر به اینجا می‌رسد.
 *
 * `ready` هم حذف شد. وجودش برای پوشاندن یک تأخیر بود که دیگر نیست: نشست همراه
 * اولین رندر سرور می‌آید، پس پرشِ «ورود | ثبت‌نام» ← «پروفایل» رخ نمی‌دهد و
 * hydration هم به‌هم نمی‌ریزد.
 */
export function AuthProvider({
  user,
  children,
}: {
  user: SessionUser | null
  children: ReactNode
}) {
  const value = useMemo<AuthValue>(
    () => ({
      user,
      isLoggedIn: user !== null,
      isOwner: isOwner(user),
      isAdmin: isAdmin(user),
    }),
    [user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
