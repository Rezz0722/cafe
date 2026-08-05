/**
 * استایل نقشه — `/api/map/style?theme=light|dark`
 *
 * استایل از سرور می‌آید نه از بسته‌ی کلاینت، به دو دلیل:
 *   • رنگ‌ها یک منبع دارند (`src/core/map/style.ts`) و با توکن‌های سایت
 *     هم‌گام می‌مانند؛
 *   • عوض‌کردن تم یا رنگ نقشه نیازی به ری‌بیلد کلاینت ندارد.
 */

import { buildMapStyle } from '@/core/map/style'
import { isMapReady } from '@/core/map/tiles'

export const dynamic = 'force-static'

export async function GET(request: Request): Promise<Response> {
  if (!isMapReady()) {
    return Response.json(
      { error: 'داده‌ی نقشه استخراج نشده است. اجرا کنید: node scripts/map-extract.mjs' },
      { status: 503 },
    )
  }

  const theme = new URL(request.url).searchParams.get('theme') === 'dark' ? 'dark' : 'light'
  const style = buildMapStyle({ theme })

  return Response.json(style, {
    headers: { 'Cache-Control': 'public, max-age=3600' },
  })
}
