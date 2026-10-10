export const MESSAGE_LIMIT = 2000
export const ROADMAP_LIMIT = 12000
export const MESSAGE_FILE = /^\d{13}-[0-9a-f-]{36}\.json$/
export type ConsoleMessageKind = 'question' | 'work' | 'roadmap'

export function validateConsoleMessageKind(value: unknown): ConsoleMessageKind | null {
  return value === 'question' || value === 'work' || value === 'roadmap' ? value : null
}

export function validateConsoleMessage(value: unknown, kind: ConsoleMessageKind = 'question'): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  const limit = kind === 'roadmap' ? ROADMAP_LIMIT : MESSAGE_LIMIT
  if (text.length < 2 || text.length > limit || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(text)) return null
  return text
}

export function sameOrigin(origin: string | null, publicSiteUrl: string | undefined): boolean {
  if (!origin || !publicSiteUrl) return false
  try {
    const site = new URL(publicSiteUrl)
    if (!['http:', 'https:'].includes(site.protocol) || site.username || site.password) return false
    // The browser's Origin names the public HTTPS site. Behind the reverse
    // proxy, NextRequest.nextUrl may instead describe the internal HTTP hop.
    return origin === site.origin
  } catch {
    return false
  }
}
