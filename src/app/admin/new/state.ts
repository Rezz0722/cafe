/**
 * وضعیت فرم ثبت کافه.
 *
 * عمداً جدا از `actions.ts`: یک ماژول `'use server'` فقط اجازه دارد تابع
 * async export کند. اگر یک const از آنجا export شود، Next آن را حذف می‌کند و
 * سمت کلاینت `undefined` می‌رسد — که به‌شکل یک خطای مبهم
 * («Cannot read properties of undefined») موقع prerender ظاهر می‌شود.
 */

export interface CreatePlaceState {
  ok: boolean
  errors: { field: string; message: string }[]
  /** وقتی پر است یعنی کاربر باید تکراری‌بودن را تأیید یا رد کند. */
  duplicates: { slug: string; name: string }[]
  createdSlug?: string
  createdName?: string
}

export const EMPTY_STATE: CreatePlaceState = { ok: false, errors: [], duplicates: [] }
