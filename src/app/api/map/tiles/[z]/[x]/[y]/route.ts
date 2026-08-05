/**
 * سرو تایل برداری نقشه — `/api/map/tiles/{z}/{x}/{y}`
 *
 * پسوند `.pbf` روی نام فایل نیست چون در مسیر Next.js پارامتر پویا نمی‌تواند
 * پسوند داشته باشد؛ MapLibre هم به پسوند کاری ندارد و از `Content-Type`
 * تصمیم می‌گیرد.
 *
 * کش: تایل‌ها از داده‌ی ثابتِ استخراج‌شده ساخته می‌شوند و تا ایمپورت بعدیِ
 * نقشه عوض نمی‌شوند، پس `immutable` با عمر یک ساله درست است. بدون کش،
 * هر جابه‌جایی نقشه ده‌ها تایل را از نو می‌سازد.
 */

import { buildTile, isMapReady, MAX_ZOOM, MIN_ZOOM } from '@/core/map/tiles'

export const dynamic = 'force-static'
export const revalidate = false

export async function GET(
  _request: Request,
  context: { params: Promise<{ z: string; x: string; y: string }> },
): Promise<Response> {
  const { z, x, y } = await context.params

  if (!isMapReady()) {
    return new Response('داده‌ی نقشه استخراج نشده — node scripts/map-extract.mjs', {
      status: 503,
    })
  }

  const zoom = Number.parseInt(z, 10)
  const tileX = Number.parseInt(x, 10)
  const tileY = Number.parseInt(y, 10)

  if (!Number.isInteger(zoom) || !Number.isInteger(tileX) || !Number.isInteger(tileY)) {
    return new Response('پارامتر تایل نامعتبر', { status: 400 })
  }
  if (zoom < MIN_ZOOM || zoom > MAX_ZOOM) {
    return new Response(null, { status: 204 })
  }
  // بیرون از محدوده‌ی معتبرِ آن زوم — درخواستِ خراب یا کاوشگر.
  const max = 2 ** zoom
  if (tileX < 0 || tileY < 0 || tileX >= max || tileY >= max) {
    return new Response('مختصات تایل بیرون محدوده', { status: 400 })
  }

  const tile = buildTile(zoom, tileX, tileY)

  // تایلِ خالی وضعیت طبیعی است (دریا، بیابان، بیرون شهر). ۲۰۴ برمی‌گردانیم
  // نه ۴۰۴، وگرنه کنسول مرورگر پر از خطا می‌شود.
  if (!tile) return new Response(null, { status: 204 })

  return new Response(new Uint8Array(tile), {
    headers: {
      'Content-Type': 'application/vnd.mapbox-vector-tile',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Length': String(tile.byteLength),
    },
  })
}
