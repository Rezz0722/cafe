import 'server-only'
import { withDbTransaction } from '@/db/client'
import { bumpOtpAttempts, consumeOtp, getActiveOtp, type OtpPurpose } from './userRepo'
import { verifyCode, type OtpPolicy } from './otp'
import { toAsciiDigits } from '@/core/text/normalize'

export async function verifyStoredOtp(phone: string, code: string, purpose: OtpPurpose, policy: OtpPolicy, expectedId?: number): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!code) return { ok: false, error: 'کد را وارد کنید.' }
  return withDbTransaction(async () => {
    const active = await getActiveOtp(phone, purpose, true)
    if (expectedId !== undefined && active?.id !== expectedId) return { ok: false as const, error: 'کد این صفحه جایگزین شده است. کد تازه درخواست کنید.' }
    const verifyAt = Date.now()
    const result = verifyCode(active ? {
      phone, codeHash: active.codeHash, expiresAt: active.expiresAt.getTime(), attempts: active.attempts, createdAt: active.createdAt.getTime(), recentRequests: [],
    } : null, phone, toAsciiDigits(code), verifyAt, policy.maxAttempts)
    console.info('[auth:otp:verify]', JSON.stringify({ challengeId: active?.id, purpose, phoneSuffix: phone.slice(-4), verifyAt, expiresAt: active?.expiresAt.getTime(), attempts: active?.attempts, ok: result.ok, responseAt: Date.now() }))
    if (!result.ok) {
      if (active) {
        if (result.burned) await consumeOtp(active.id)
        else await bumpOtpAttempts(active.id)
      }
      return { ok: false as const, error: result.reason }
    }
    if (active) await consumeOtp(active.id)
    return { ok: true as const }
  })
}
