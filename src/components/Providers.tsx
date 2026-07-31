'use client'

import type { ReactNode } from 'react'
import { AuthProvider } from '@/hooks/useAuth'
import { SavedCafesProvider } from '@/hooks/useSavedCafes'

/**
 * تنها مرز client در ریشه‌ی درخت.
 *
 * Context فقط سمت کلاینت کار می‌کند، پس providerها باید در یک کامپوننت
 * `'use client'` باشند. اما `children` که از layout سرور می‌آید همچنان
 * server component می‌ماند — Next آن را از قبل رندر می‌کند و به‌عنوان
 * prop رد می‌کند. یعنی صفحات SSR خودشان را از دست نمی‌دهند.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <SavedCafesProvider>{children}</SavedCafesProvider>
    </AuthProvider>
  )
}
