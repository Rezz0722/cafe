import { NextRequest, NextResponse } from 'next/server'
import { requireAdminRead } from '@/core/admin/access'
import { loadOwnerPlace } from '@/core/places/manage'
import { buildMenuExport } from '@/core/places/menuExport'
import { createMenuExportResponse, menuExportPrivateHeaders, parseMenuExportFormat, parseMenuExportPlaceId } from '@/core/places/menuExportResponse'
import { withDbTransaction } from '@/db/client'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const format = parseMenuExportFormat(request.nextUrl.searchParams.get('format'))
  if (!format) {
    return NextResponse.json({ error: 'فرمت خروجی معتبر نیست.' }, { status: 400, headers: menuExportPrivateHeaders })
  }
  const placeId = parseMenuExportPlaceId(request.nextUrl.searchParams.get('placeId'))
  if (!placeId) {
    return NextResponse.json({ error: 'شناسه مجموعه معتبر نیست.' }, { status: 400, headers: menuExportPrivateHeaders })
  }

  const access = await requireAdminRead(placeId, true)
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status, headers: menuExportPrivateHeaders })
  }

  try {
    // Read every category, item and variant from one database snapshot.
    const place = await withDbTransaction(() => loadOwnerPlace(placeId))
    if (!place) return NextResponse.json({ error: 'مجموعه پیدا نشد.' }, { status: 404, headers: menuExportPrivateHeaders })
    const body = buildMenuExport(place, new Date())
    return createMenuExportResponse(body, placeId, format)
  } catch {
    return NextResponse.json({ error: 'خروجی منو آماده نشد؛ دوباره تلاش کنید.' }, { status: 503, headers: menuExportPrivateHeaders })
  }
}
