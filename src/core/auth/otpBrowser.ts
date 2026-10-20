import 'server-only'
import { cookies } from 'next/headers'
import { SESSION_SECRET } from '@/core/config/env'
import { signClaims, verifyClaims, type TokenClaims } from './token'
import type { OtpPurpose, StoredOtp } from './userRepo'

interface OtpClaims extends TokenClaims { kind: 'otp-challenge'; id: number; phone: string; purpose: OtpPurpose }
const cookieName = (purpose: OtpPurpose) => `kucafe_otp_${purpose}`
export const REGISTRATION_PROOF_COOKIE = 'kucafe_registration_verified'
interface RegistrationProof extends TokenClaims { kind: 'registration-verified'; phone: string; challengeId: number }

export async function readRegistrationProof() {
  const proof = verifyClaims<RegistrationProof>((await cookies()).get(REGISTRATION_PROOF_COOKIE)?.value, SESSION_SECRET)
  return proof?.kind === 'registration-verified' && typeof proof.phone === 'string' ? proof : null
}

export async function bindRegistrationProof(phone: string, challengeId: number) {
  const exp = Math.floor(Date.now() / 1000) + 600
  const store = await cookies()
  store.set(REGISTRATION_PROOF_COOKIE, signClaims<RegistrationProof>({ kind: 'registration-verified', phone, challengeId, exp }, SESSION_SECRET), {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' && process.env.ALLOW_INSECURE_SESSION_COOKIE !== '1', path: '/', maxAge: 600,
  })
  return { ok: true, verified: true, phone, challengeId, serverNow: Date.now(), expiresAt: exp * 1000, resendAt: exp * 1000 }
}

export async function bindOtpBrowser(row: StoredOtp) {
  if (row.purpose === 'verify_phone') (await cookies()).delete(REGISTRATION_PROOF_COOKIE)
  const token = signClaims<OtpClaims>({ kind: 'otp-challenge', id: row.id, phone: row.phone, purpose: row.purpose, exp: Math.floor(Date.now() / 1000) + 3600 }, SESSION_SECRET)
  ;(await cookies()).set(cookieName(row.purpose), token, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' && process.env.ALLOW_INSECURE_SESSION_COOKIE !== '1', path: '/', maxAge: 3600,
  })
}

export async function readOtpBrowser(purpose: OtpPurpose): Promise<OtpClaims | null> {
  const value = (await cookies()).get(cookieName(purpose))?.value
  const claims = verifyClaims<OtpClaims>(value, SESSION_SECRET)
  return claims?.kind === 'otp-challenge' && claims.purpose === purpose && Number.isSafeInteger(claims.id) && typeof claims.phone === 'string' ? claims : null
}
