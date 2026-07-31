/**
 * دسترسی به localStorage که هرگز throw نمی‌کند.
 *
 * سافاری در حالت خصوصی و مرورگرهایی که ذخیره‌سازی شخص‌ثالث را بسته‌اند، روی
 * *دسترسی به خودِ* `localStorage` خطا می‌دهند — نه فقط روی خواندن. پس کل
 * تماس داخل try است، نه فقط بدنه‌اش.
 *
 * علاوه بر آن، زیر SSR اصلاً `window` وجود ندارد؛ بررسی `typeof window`
 * جلوی خطای زمان build را می‌گیرد.
 */

const hasWindow = () => typeof window !== 'undefined'

export function readJson<T>(key: string, fallback: T): T {
  if (!hasWindow()) return fallback
  try {
    const raw = window.localStorage.getItem(key)
    if (raw === null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function writeJson(key: string, value: unknown): void {
  if (!hasWindow()) return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* ذخیره‌سازی در دسترس نیست یا پر است — UI از روی state کار می‌کند */
  }
}

export function readRaw(key: string): string | null {
  if (!hasWindow()) return null
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writeRaw(key: string, value: string): void {
  if (!hasWindow()) return
  try {
    window.localStorage.setItem(key, value)
  } catch {
    /* ignore */
  }
}

export function remove(key: string): void {
  if (!hasWindow()) return
  try {
    window.localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

export const STORAGE_KEYS = {
  user: 'cafegard_user',
  /** یک کلید آرایه‌ای برای همه‌ی ذخیره‌شده‌ها — نه یک کلید در ازای هر کافه. */
  saved: 'cafegard_saved',
} as const
