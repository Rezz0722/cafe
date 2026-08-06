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
import { getMapPolicy } from '@/core/settings/policies'

/*
  قبلاً `force-static` بود. حالا که «زومِ نمایش ساختمان» از دیتابیس می‌آید،
  استایلِ استاتیک یعنی تغییرِ آن تنظیم تا ری‌دیپلوی بعدی دیده نمی‌شود. کش یک
  ساعته‌ی HTTP همان صرفه را دارد بدون آن تله.
*/
export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  if (!isMapReady()) {
    return Response.json(
      { error: 'داده‌ی نقشه استخراج نشده است. اجرا کنید: node scripts/map-extract.mjs' },
      { status: 503 },
    )
  }

  const theme = new URL(request.url).searchParams.get('theme') === 'dark' ? 'dark' : 'light'
  const map = await getMapPolicy()
  const style = buildMapStyle({ theme, buildingsFromZoom: map.showBuildingsFromZoom })

  return Response.json(style, {
    headers: { 'Cache-Control': 'public, max-age=3600' },
  })
}
