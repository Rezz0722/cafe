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

export interface SessionPayload {
  userId: string
  phone: string
  role: Role
  /** ثانیه از epoch. */
  exp: number
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

export function signToken(payload: SessionPayload, secret: string): string {
  const body = b64url(Buffer.from(JSON.stringify(payload), 'utf8'))
  return `${body}.${sign(body, secret)}`
}

/** `null` یعنی نامعتبر، دستکاری‌شده، یا منقضی. */
export function verifyToken(
  token: string | undefined,
  secret: string,
  now = Date.now(),
): SessionPayload | null {
  if (!token || !secret) return null

  const dot = token.lastIndexOf('.')
  if (dot < 1) return null

  const body = token.slice(0, dot)
  const signature = token.slice(dot + 1)

  if (!safeEqual(signature, sign(body, secret))) return null

  try {
    const payload = JSON.parse(fromB64url(body).toString('utf8')) as SessionPayload
    if (!payload?.userId || typeof payload.exp !== 'number') return null
    if (payload.exp < Math.floor(now / 1000)) return null
    return payload
  } catch {
    return null
  }
}
