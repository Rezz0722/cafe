import type { Metadata } from 'next'
import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { RegisterScreen } from '@/components/auth/RegisterScreen'
import { getCurrentUser } from '@/core/auth/currentUser'
import { safeAuthRedirect } from '@/core/auth/redirect'
import { getAuthPolicy } from '@/core/settings/policies'
import { paths } from '@/routes'

export const metadata: Metadata = { title: 'ساخت حساب', robots: { index: false, follow: false } }

interface Props { searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function RegisterPage({ searchParams }: Props) {
  const params = await searchParams
  const redirectTo = safeAuthRedirect(typeof params.redirect === 'string' ? params.redirect : null)
  if (await getCurrentUser()) redirect(redirectTo)
  const policy = await getAuthPolicy()
  if (!policy.allowRegistration) redirect(paths.auth)
  return (
    <Suspense fallback={null}>
      <RegisterScreen config={{
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
