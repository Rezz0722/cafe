/**
 * localStorage access that never throws. Private-mode Safari and blocked
 * third-party storage both make `localStorage` itself raise on access, so every
 * call is wrapped rather than just the read.
 */

export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key)
    if (raw === null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage unavailable or full — the UI keeps working from React state */
  }
}

export function readRaw(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writeRaw(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    /* ignore */
  }
}

export function remove(key: string): void {
  try {
    window.localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

export const STORAGE_KEYS = {
  user: 'cafegard_user',
  /** Saved venues are stored one key per venue: `cafegard_saved_<id>`. */
  savedPrefix: 'cafegard_saved_',
} as const
