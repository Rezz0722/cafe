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
  preserveDraft?: boolean
  credentials?: { username: string; password: string }
  preview?: { fingerprint: string; itemCount: number; variantCount: number; percent: number; changes: { name: string; label: string | null; oldPrice: number; newPrice: number }[] }
  menuImportPreview?: import('@/core/import/menuCsv').MenuImportPreview
  menuImportAppliedRevision?: number
}

export const EMPTY_VENUE_STATE: VenueActionState = { ok: false }
