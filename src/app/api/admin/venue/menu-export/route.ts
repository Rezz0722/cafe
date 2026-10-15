import { NextRequest, NextResponse } from 'next/server'
import { requireAdminRead } from '@/core/admin/access'
import { loadOwnerPlace } from '@/core/places/manage'
import { buildMenuExport } from '@/core/places/menuExport'
import { withDbTransaction } from '@/db/client'

export const dynamic = 'force-dynamic'

const privateHeaders = {
  'Cache-Control': 'private, no-store, max-age=0',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex',
}

export async function GET(request: NextRequest) {
  const rawId = request.nextUrl.searchParams.get('placeId')
  if (!rawId || !/^[1-9]\d*$/.test(rawId)) {
    return NextResponse.json({ error: 'شناسه مجموعه معتبر نیست.' }, { status: 400, headers: privateHeaders })
  }
  const placeId = Number(rawId)
  if (!Number.isSafeInteger(placeId)) {
    return NextResponse.json({ error: 'شناسه مجموعه معتبر نیست.' }, { status: 400, headers: privateHeaders })
  }

  const access = await requireAdminRead(placeId, true)
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status, headers: privateHeaders })
  }

  try {
    // Read every category, item and variant from one database snapshot.
    const place = await withDbTransaction(() => loadOwnerPlace(placeId))
    if (!place) return NextResponse.json({ error: 'مجموعه پیدا نشد.' }, { status: 404, headers: privateHeaders })
    const body = buildMenuExport(place, new Date())
    return new NextResponse(JSON.stringify(body), {
      status: 200,
      headers: {
        ...privateHeaders,
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="kucafe-menu-${placeId}.json"`,
      },
    })
  } catch {
    return NextResponse.json({ error: 'خروجی منو آماده نشد؛ دوباره تلاش کنید.' }, { status: 503, headers: privateHeaders })
  }
}
