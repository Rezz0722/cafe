import { createHmac, timingSafeEqual } from 'node:crypto'
import type { Role } from './types'

/**
 * امضا و بررسی توکن نشست — منطق خالص.
 *
 * راز به‌عنوان پارامتر می‌آید نه از env، تا این بخش **قابل تست** باشد.
 * خواندن راز کار `session.ts` است که `server-only` است.
 *
 * محتوا امضا می‌شود نه رمزنگاری: چیز محرمانه‌ای داخلش نیست (شناسه و نقش)،
 * فقط باید دستکاری‌ناپذیر باشد. اگر کاربر `role` را در کوکی به `admin` عوض
 * کند، امضا نمی‌خواند و توکن رد می‌شود.
 */

/** هر چیزی که امضا می‌شود باید تاریخ انقضا داشته باشد. */
export interface TokenClaims {
  /** ثانیه از epoch. */
  exp: number
}

export interface SessionPayload extends TokenClaims {
  userId: string
  phone: string
  role: Role
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromB64url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

function sign(data: string, secret: string): string {
  return b64url(createHmac('sha256', secret).update(data).digest())
}

/** مقایسه‌ی زمان‌ثابت — جلوی استخراج امضا با سنجش زمان پاسخ. */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

/**
 * امضای هر بار داده‌ی منقضی‌شونده — نشست، و «مشاهده به‌عنوان».
 *
 * جنریک است چون کوکی دوم (impersonation) همین خاصیت‌ها را لازم دارد —
 * دستکاری‌ناپذیری و انقضا — ولی محتوایش نشست نیست. یک پیاده‌سازیِ امضا برای
 * هر دو، بهتر از دو پیاده‌سازی است که فقط یکی‌شان تست دارد.
 */
export function signClaims<T extends TokenClaims>(claims: T, secret: string): string {
  const body = b64url(Buffer.from(JSON.stringify(claims), 'utf8'))
  return `${body}.${sign(body, secret)}`
}

/** `null` یعنی نامعتبر، دستکاری‌شده، یا منقضی. */
export function verifyClaims<T extends TokenClaims>(
  token: string | undefined,
  secret: string,
  now = Date.now(),
): T | null {
  if (!token || !secret) return null

  const dot = token.lastIndexOf('.')
  if (dot < 1) return null

  const body = token.slice(0, dot)
  const signature = token.slice(dot + 1)

  if (!safeEqual(signature, sign(body, secret))) return null

  try {
    const claims = JSON.parse(fromB64url(body).toString('utf8')) as T
    if (typeof claims?.exp !== 'number') return null
    if (claims.exp < Math.floor(now / 1000)) return null
    return claims
  } catch {
    return null
  }
}

export function signToken(payload: SessionPayload, secret: string): string {
  return signClaims(payload, secret)
}

/** `null` یعنی نامعتبر، دستکاری‌شده، یا منقضی. */
export function verifyToken(
  token: string | undefined,
  secret: string,
  now = Date.now(),
): SessionPayload | null {
  const payload = verifyClaims<SessionPayload>(token, secret, now)
  return payload?.userId ? payload : null
}
