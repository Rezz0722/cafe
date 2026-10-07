import QRCode from 'qrcode'
import { resolveQrChannel } from '@/core/qr/channels'
import { qrModulesToSvg } from '@/core/qr/svg'
import { absoluteUrl } from '@/routes'

export const dynamic = 'force-dynamic'
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token
  const qr = await resolveQrChannel(token)
  const headers = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff' }
  if (!qr) return new Response('Not found', { status: 404, headers })
  const code = QRCode.create(absoluteUrl(`/q/${token}`), { errorCorrectionLevel: 'H' })
  return new Response(qrModulesToSvg(code.modules, { margin: 4, width: 1024 }), { headers: { ...headers, 'Content-Type': 'image/svg+xml; charset=utf-8',
    'Content-Disposition': `${new URL(request.url).searchParams.get('download') === '1' ? 'attachment' : 'inline'}; filename="kucafe-qr-${qr.id}.svg"` } })
}
