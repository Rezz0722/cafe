import { NextRequest, NextResponse } from 'next/server'
import { requireAdminRead } from '@/core/admin/access'
import { listSharedCategoryArtwork } from '@/core/places/manage'

export const dynamic = 'force-dynamic'

const json = (body: object, status = 200) => NextResponse.json(body, {
  status,
  headers: { 'Cache-Control': 'private, no-store, max-age=0' },
})

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const placeId = Number(params.get('placeId'))
  const page = Number(params.get('page') ?? '1')
  const facetId = params.get('facet')?.trim() ?? ''
  const query = params.get('q')?.trim() ?? ''

  if (!Number.isSafeInteger(placeId) || placeId <= 0 ||
      !Number.isSafeInteger(page) || page < 1 || page > 200 ||
      facetId.length > 48 || query.length > 80) {
    return json({ error: 'درخواست کتابخانه معتبر نیست.' }, 400)
  }

  const access = await requireAdminRead(placeId)
  if (!access.ok) return json({ error: access.error }, access.status)

  try {
    return json(await listSharedCategoryArtwork({ facetId, query, page, limit: 24 }))
  } catch {
    return json({ error: 'کتابخانهٔ تصاویر دریافت نشد؛ دوباره تلاش کنید.' }, 503)
  }
}
