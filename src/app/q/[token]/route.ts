import { resolveQrChannel, recordQrOpen } from '@/core/qr/channels'
import { QR_COOKIE, qrRecentlySeen, qrRequestCountable, qrSeenCookie } from '@/core/qr/channelPolicy'
import { getSettings } from '@/core/settings/store'
import { absoluteUrl } from '@/routes'

export const dynamic = 'force-dynamic'
const privateHeaders = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer' }
async function open(request: Request, token: string, count: boolean) {
  const qr = await resolveQrChannel(token)
  if (!qr) return new Response('این QR فعال نیست یا شعبه در دسترس نیست.', { status: 404, headers: privateHeaders })
  const response = new Response(null, { status: 302, headers: { ...privateHeaders, Location: absoluteUrl(`/cafe/${encodeURIComponent(qr.slug)}?menu=1`) } })
  if (count && qrRequestCountable(request.headers, request.method)) {
    try {
      const settings = await getSettings(), secret = process.env.SESSION_SECRET || ''
      const cookie = (request.headers.get('cookie') || '').split(';').map(part => part.trim()).find(part => part.startsWith(`${QR_COOKIE}=`))?.slice(QR_COOKIE.length + 1)
      if (settings.trackPageViews && secret.length >= 32 && !qrRecentlySeen(cookie, token, secret)) {
        await recordQrOpen(qr.id)
        response.headers.set('Set-Cookie', `${QR_COOKIE}=${qrSeenCookie(token, secret)}; Path=/q; Max-Age=1800; HttpOnly; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`)
      }
    } catch { console.warn('[qr] aggregate unavailable; redirect preserved') }
  }
  return response
}
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) { return open(request, (await params).token, true) }
export async function HEAD(request: Request, { params }: { params: Promise<{ token: string }> }) { return open(request, (await params).token, false) }
