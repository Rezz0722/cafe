/**
 * وضعیت فرم‌های پنل کاربر.
 *
 * جدا از `actions.ts` چون یک ماژول `'use server'` **فقط تابع async** می‌تواند
 * export کند. یک `const` از آنجا، در زمان build خطا می‌دهد:
 * «A "use server" file can only export async functions».
 */

export interface ActionState {
  ok: boolean
  error?: string
  message?: string
}

export const EMPTY_ACTION_STATE: ActionState = { ok: false }
