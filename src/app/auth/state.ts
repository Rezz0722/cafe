import type { Role } from '@/core/auth/types'

/**
 * وضعیت فرم‌های ورود.
 *
 * جدا از `actions.ts` چون یک ماژول `'use server'` فقط تابع async می‌تواند
 * export کند — یک const از آنجا سمت کلاینت `undefined` می‌رسد.
 */

export interface RequestCodeState {
  ok: boolean
  error?: string
  phone?: string
  retryAfterSec?: number
  /** true یعنی پیامکی ارسال نشد و کد در ترمینال سرور است. */
  devMode?: boolean
}

export interface VerifyCodeState {
  ok: boolean
  error?: string
  needsName?: boolean
  role?: Role
}

export interface PasswordLoginState {
  ok: boolean
  error?: string
  role?: Role
}

export const EMPTY_PASSWORD_STATE: PasswordLoginState = { ok: false }

export const EMPTY_REQUEST_STATE: RequestCodeState = { ok: false }
export const EMPTY_VERIFY_STATE: VerifyCodeState = { ok: false }
export const EMPTY_NAME_STATE: { ok: boolean; error?: string } = { ok: false }
