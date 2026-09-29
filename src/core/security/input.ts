const UNSAFE_CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E\u2066-\u2069]/g

/** متن کاربر را بدون HTML-rendering نگه می‌داریم، اما کنترل‌ها و bidi override حذف می‌شوند. */
export function cleanUserText(value: string | null | undefined, maxLength: number): string {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(UNSAFE_CONTROL, '')
    .replace(/\r\n?/g, '\n')
    .trim()
    .slice(0, maxLength)
}

/** فقط handle معتبر اینستاگرام؛ URL دامنهٔ مشابه یا path اضافه پذیرفته نمی‌شود. */
export function normalizeInstagram(value: string | null | undefined): string | null {
  let raw = cleanUserText(value, 300)
  if (!raw) return null
  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw)
      if (!['instagram.com', 'www.instagram.com'].includes(url.hostname.toLowerCase())) return null
      raw = url.pathname.split('/').filter(Boolean)[0] ?? ''
    } catch {
      return null
    }
  } else {
    raw = raw.replace(/^(?:www\.)?instagram\.com\//i, '').split('/')[0] ?? ''
  }
  raw = raw.replace(/^@/, '')
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9._]{0,28}[A-Za-z0-9_])?$/.test(raw)) return null
  if (raw.includes('..')) return null
  return raw
}

export function safeExternalUrl(value: string | null | undefined): string | null {
  const raw = cleanUserText(value, 500)
  if (!raw) return null
  try {
    const url = new URL(raw)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null
  } catch {
    return null
  }
}

/** فقط لینک مستقیم محتوای اینستاگرام؛ پروفایل و دامنه‌های مشابه پذیرفته نمی‌شوند. */
export function normalizeInstagramContentUrl(value: string | null | undefined): string | null {
  const raw = cleanUserText(value, 500)
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' || !['instagram.com', 'www.instagram.com'].includes(url.hostname.toLowerCase())) return null
    const parts = url.pathname.split('/').filter(Boolean)
    if (!['p', 'reel', 'reels', 'tv'].includes(parts[0] ?? '') || !parts[1]) return null
    return `https://www.instagram.com/${parts[0]}/${parts[1]}/`
  } catch {
    return null
  }
}
