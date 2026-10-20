import { NextRequest, NextResponse } from 'next/server'
import { readOtpBrowser, readRegistrationProof, REGISTRATION_PROOF_COOKIE } from '@/core/auth/otpBrowser'
import { getActiveOtp, listRecentOtpTimes, type OtpPurpose } from '@/core/auth/userRepo'
import { canRequestCode } from '@/core/auth/otp'
import { getAuthPolicy } from '@/core/settings/policies'
import { cookies } from 'next/headers'

export async function DELETE(request: NextRequest) {
  // Next's internal request URL can use localhost behind a reverse proxy.
  // Compare with the configured public origin, never a forwarded client value.
  const publicOrigin = new URL(process.env.NEXT_PUBLIC_SITE_URL || request.url).origin
  if (request.headers.get('origin') !== publicOrigin) return new NextResponse(null, { status: 403 })
  const purpose = request.nextUrl.searchParams.get('purpose')
  if (!purpose || !['login', 'verify_phone', 'reset_password'].includes(purpose)) return new NextResponse(null, { status: 400 })
  ;(await cookies()).delete(`kucafe_otp_${purpose}`)
  if (purpose === 'verify_phone') (await cookies()).delete(REGISTRATION_PROOF_COOKIE)
  return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
}

export async function GET(request: NextRequest) {
  const purpose = request.nextUrl.searchParams.get('purpose') as OtpPurpose
  const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' }
  if (!['login', 'verify_phone', 'reset_password'].includes(purpose)) return NextResponse.json({ ok: false }, { status: 400, headers })
  const proof = purpose === 'verify_phone' ? await readRegistrationProof() : null
  if (proof) return NextResponse.json({ ok: true, verified: true, phone: proof.phone, challengeId: proof.challengeId, serverNow: Date.now(), expiresAt: proof.exp * 1000, resendAt: proof.exp * 1000 }, { headers })
  const claims = await readOtpBrowser(purpose)
  if (!claims) return NextResponse.json({ ok: false }, { headers })
  const [row, policy, recentRequests] = await Promise.all([getActiveOtp(claims.phone, purpose), getAuthPolicy(), listRecentOtpTimes(claims.phone, 3600)])
  if (!row || row.id !== claims.id) return NextResponse.json({ ok: false, replaced: true }, { headers })
  const now = Date.now()
  const decision = canRequestCode({ phone: row.phone, codeHash: '', expiresAt: row.expiresAt.getTime(), createdAt: row.createdAt.getTime(), attempts: row.attempts, recentRequests }, now, policy.otp)
  return NextResponse.json({ ok: true, phone: row.phone, challengeId: row.id, serverNow: now, expiresAt: row.expiresAt.getTime(), resendAt: decision.allowed ? now : now + decision.retryAfterSec * 1000 }, { headers })
}
