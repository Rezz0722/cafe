export const MESSAGE_LIMIT = 2000
export const MESSAGE_FILE = /^\d{13}-[0-9a-f-]{36}\.json$/
export type ConsoleMessageKind = 'question' | 'work'

export function validateConsoleMessageKind(value: unknown): ConsoleMessageKind | null {
  return value === 'question' || value === 'work' ? value : null
}

export function validateConsoleMessage(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (text.length < 2 || text.length > MESSAGE_LIMIT || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(text)) return null
  return text
}

export function sameOrigin(origin: string | null, expected: string): boolean {
  return origin === expected
}
