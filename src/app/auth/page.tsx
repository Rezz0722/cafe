import type { Metadata } from 'next'
import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { AuthScreen } from '@/components/auth/AuthScreen'
import { getCurrentUser } from '@/core/auth/currentUser'
import { getAuthPolicy } from '@/core/settings/policies'
import { paths } from '@/routes'

/**
 * صفحه‌ی ورود — خصوصی، پس از ایندکس بیرون است.
 *
 * `AuthScreen` از `useSearchParams` استفاده می‌کند و در App Router هر
 * کامپوننتی که این هوک را صدا بزند باید داخل مرز `Suspense` باشد.
 */
export const metadata: Metadata = {
  title: 'ورود و ثبت‌نام',
  robots: { index: false, follow: false },
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function AuthPage({ searchParams }: PageProps) {
  // کاربری که از قبل وارد شده نباید فرم ورود ببیند — گیج‌کننده است و
  // ارسال کد دوباره، بی‌دلیل اعتبار پیامک را می‌سوزاند.
  const user = await getCurrentUser()
  if (user) {
    const params = await searchParams
    const raw = params.redirect
    const target = typeof raw === 'string' ? raw : paths.profile
    // فقط مسیر داخلی — جلوی open redirect به دامنه‌ی بیرونی.
    redirect(target.startsWith('/') && !target.startsWith('//') ? target : paths.profile)
  }

  const policy = await getAuthPolicy()

  return (
    <Suspense fallback={null}>
      <AuthScreen
        config={{
          otpLength: policy.otp.length,
          resendCooldownSeconds: policy.otp.resendCooldownSeconds,
          passwordMinLength: policy.passwordMinLength,
          allowRegistration: policy.allowRegistration,
          allowPasswordLogin: policy.allowPasswordLogin,
          allowOtpLogin: policy.allowOtpLogin,
        }}
      />
    </Suspense>
  )
}
