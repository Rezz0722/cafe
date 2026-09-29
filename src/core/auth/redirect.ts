/** مقصد پس از ورود فقط می‌تواند path داخلی باشد؛ scheme-relative هم رد است. */
export function safeAuthRedirect(raw: string | null | undefined, fallback = '/profile'): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return fallback
  try {
    const parsed = new URL(raw, 'https://kucafe.invalid')
    return parsed.origin === 'https://kucafe.invalid'
      ? `${parsed.pathname}${parsed.search}${parsed.hash}`
      : fallback
  } catch {
    return fallback
  }
}

export function withAuthRedirect(path: string, redirectTo: string): string {
  return `${path}?redirect=${encodeURIComponent(safeAuthRedirect(redirectTo))}`
}
