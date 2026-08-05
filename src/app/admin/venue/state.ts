/**
 * وضعیت فرم‌های پنل کافه‌دار.
 *
 * جدا از `actions.ts` چون یک ماژول `'use server'` فقط تابع async می‌تواند
 * export کند.
 */

export interface VenueActionState {
  ok: boolean
  error?: string
  message?: string
}

export const EMPTY_VENUE_STATE: VenueActionState = { ok: false }
