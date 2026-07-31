import type { Metadata } from 'next'
import { Suspense } from 'react'
import { AuthScreen } from '@/components/auth/AuthScreen'

/**
 * صفحه‌ی ورود — خصوصی، پس از ایندکس بیرون است.
 *
 * `AuthScreen` از `useSearchParams` استفاده می‌کند و در App Router هر کامپوننتی
 * که این هوک را صدا بزند باید داخل یک مرز `Suspense` باشد، وگرنه کل صفحه در
 * build به رندر داینامیک می‌افتد.
 */
export const metadata: Metadata = {
  title: 'ورود و ثبت‌نام',
  robots: { index: false, follow: false },
}

export default function AuthPage() {
  return (
    <Suspense fallback={null}>
      <AuthScreen />
    </Suspense>
  )
}
