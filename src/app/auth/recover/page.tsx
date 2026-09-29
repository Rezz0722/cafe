import type { Metadata } from 'next'
import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { RecoverScreen } from '@/components/auth/RecoverScreen'
import { getCurrentUser } from '@/core/auth/currentUser'
import { safeAuthRedirect } from '@/core/auth/redirect'
import { getAuthPolicy } from '@/core/settings/policies'

export const metadata: Metadata = { title: 'بازیابی رمز عبور', robots: { index: false, follow: false } }

interface Props { searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function RecoverPage({ searchParams }: Props) {
  const params = await searchParams
  const redirectTo = safeAuthRedirect(typeof params.redirect === 'string' ? params.redirect : null)
  if (await getCurrentUser()) redirect(redirectTo)
  const policy = await getAuthPolicy()
  return (
    <Suspense fallback={null}>
      <RecoverScreen config={{
        otpLength: policy.otp.length,
        otpTtlSeconds: policy.otp.ttlSeconds,
        resendCooldownSeconds: policy.otp.resendCooldownSeconds,
        passwordMinLength: policy.passwordMinLength,
        allowRegistration: policy.allowRegistration,
        allowPasswordLogin: policy.allowPasswordLogin,
        allowOtpLogin: policy.allowOtpLogin,
        allowSmsVerification: policy.allowSmsVerification,
        registrationRequiresPhoneVerification: policy.registrationRequiresPhoneVerification,
      }} />
    </Suspense>
  )
}
