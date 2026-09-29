import QRCode from 'qrcode'
import { and, eq, inArray } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { place as placeTable } from '@/db/schema'
import { absoluteUrl, paths } from '@/routes'
import { qrModulesToSvg } from '@/core/qr/svg'

export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const [place] = await getDb()
    .select({ slug: placeTable.slug, name: placeTable.name })
    .from(placeTable)
    .where(and(
      eq(placeTable.slug, slug.slice(0, 200)),
      inArray(placeTable.status, ['published', 'temporarily_closed']),
    ))
    .limit(1)
  if (!place) return new Response('Not found', { status: 404 })

  const destination = absoluteUrl(paths.cafe(place.slug))
  // خروجی پیش‌فرض qrcode از strokeهای نیم‌پیکسلی استفاده می‌کند و بعضی
  // Rasterizerهای چاپ آن را با سرِ گرد می‌کشند؛ مربع‌های fill قابل‌اعتمادند.
  const qr = QRCode.create(destination, { errorCorrectionLevel: 'H' })
  const svg = qrModulesToSvg(qr.modules, { margin: 4, width: 1024 })
  const download = new URL(request.url).searchParams.get('download') === '1'
  const safeSlug = place.slug.replace(/[^a-z0-9_-]/gi, '-')
  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="kucafe-${safeSlug}-qr.svg"`,
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
