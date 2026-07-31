import 'server-only'

import { randomBytes } from 'node:crypto'
import { SESSION_SECRET } from '@/core/config/env'
import { signToken, verifyToken, type SessionPayload } from './token'

/**
 * نشست مبتنی بر کوکی امضاشده.
 *
 * این فایل فقط راز را از env می‌خواند و به منطق خالصِ `token.ts` می‌دهد.
 * جداسازی برای این است که آن منطق قابل تست بماند بدون اینکه راز از
 * `server-only` بیرون بزند.
 *
 * ═══ چرا کوکی httpOnly و نه توکن در localStorage ═══
 *
 * توکن در localStorage با هر XSS قابل دزدیدن است. کوکی `httpOnly` را
 * جاوااسکریپت اصلاً نمی‌بیند. `SameSite=Lax` هم جلوی CSRF پایه را می‌گیرد.
 */

export const SESSION_COOKIE = 'cafegard_session'
export const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 30 // ۳۰ روز

export type { SessionPayload }

export function createSessionToken(payload: Omit<SessionPayload, 'exp'>): string {
  return signToken(
    { ...payload, exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SEC },
    SESSION_SECRET,
  )
}

export function verifySessionToken(token: string | undefined): SessionPayload | null {
  return verifyToken(token, SESSION_SECRET)
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}
