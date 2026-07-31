import type { Role } from '@/core/auth/types'

/**
 * وضعیت اکشن‌های پنل ادمین.
 *
 * جدا از `actions.ts` چون یک ماژول `'use server'` فقط تابع async می‌تواند
 * export کند — یک const از آنجا سمت کلاینت `undefined` می‌رسد و به‌شکل یک
 * خطای مبهم موقع prerender ظاهر می‌شود.
 */

export interface AdminActionState {
  ok: boolean
  /** پیام موفقیت، برای وقتی تغییر واقعاً اعمال شد. */
  message?: string
  error?: string
}

export const EMPTY_ADMIN_STATE: AdminActionState = { ok: false }

/** ترتیب نمایش در منوی نقش — از کم‌دسترسی به پردسترسی. */
export const ROLE_OPTIONS: Role[] = ['customer', 'owner', 'admin']

/** فیلترهای صف اعتبارسنجی. مقدارشان در `?filter=` می‌نشیند. */
export type QueueFilter = 'all' | 'no-attrs' | 'no-hours' | 'no-coords' | 'never-verified'

export const QUEUE_FILTER_LABELS: Record<QueueFilter, string> = {
  all: 'همه',
  'no-attrs': 'بدون ویژگی',
  'no-hours': 'بدون ساعت کاری',
  'no-coords': 'بدون مختصات',
  'never-verified': 'تأییدنشده',
}

export function parseQueueFilter(raw: string | undefined): QueueFilter {
  return raw && raw in QUEUE_FILTER_LABELS ? (raw as QueueFilter) : 'all'
}
