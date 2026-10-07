import { createHmac, timingSafeEqual } from 'node:crypto'
import { cleanUserText } from '@/core/security/input'
import { normalizeFa } from '@/core/text/normalize'

export const QR_COOKIE = 'kucafe_qr_seen'
export const QR_WINDOW = 30 * 60_000
export const validQrToken = (token: string) => /^[a-f0-9]{32}$/.test(token)
export function qrLabel(raw: string) {
  const label = cleanUserText(raw, 81).replace(/\s+/g, ' ')
  const key = normalizeFa(label)
  if (!label || label.length > 80 || !key) throw new Error('نام QR باید بین ۱ تا ۸۰ نویسه باشد.')
  return { label, key }
}
function mac(value: string, secret: string) { return createHmac('sha256', secret).update(`qr-seen:${value}`).digest('hex') }
export function qrSeenCookie(token: string, secret: string, now = Date.now()) {
  const value = `${token}.${now + QR_WINDOW}`
  return `${value}.${mac(value, secret)}`
}
export function qrRecentlySeen(cookie: string | undefined, token: string, secret: string, now = Date.now()) {
  const [seen, expiry, signature, extra] = (cookie || '').split('.')
  if (extra !== undefined || seen !== token || !/^\d+$/.test(expiry || '') || !/^[a-f0-9]{64}$/.test(signature || '')) return false
  const deadline = Number(expiry)
  if (!Number.isSafeInteger(deadline) || deadline <= now || deadline > now + QR_WINDOW) return false
  return timingSafeEqual(Buffer.from(signature!), Buffer.from(mac(`${seen}.${expiry}`, secret)))
}
export function qrRequestCountable(headers: Headers, method: string) {
  const ua = headers.get('user-agent') || ''
  return method === 'GET' && !!ua && headers.get('dnt') !== '1' && headers.get('sec-gpc') !== '1'
    && !/bot|crawler|spider|crawl|slurp|preview|headless|curl|wget|python/i.test(ua)
    && !/prefetch|prerender/i.test(`${headers.get('purpose') || ''} ${headers.get('sec-purpose') || ''}`)
}
