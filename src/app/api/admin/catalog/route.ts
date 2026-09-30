import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/core/auth/currentUser'
import { findUserById } from '@/core/auth/userRepo'
import { ADMIN_HEALTH_FILTERS, getAdminPlaces, getAdminUsers } from '@/core/admin/catalog'
export const dynamic = 'force-dynamic'
const json = (body: object, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store, max-age=0' } })
export async function GET(request: NextRequest) {
  const { user, actor } = await getSession()
  if (!user) return json({ error: 'ابتدا وارد شوید.' }, 401)
  if (actor || user.role !== 'admin') return json({ error: 'دسترسی ندارید.' }, 403)
  const account = await findUserById(user.id)
  if (!account || account.blocked || account.mustChangePassword) return json({ error: 'امنیت حساب را تکمیل کنید.' }, 403)
  const p = request.nextUrl.searchParams, type = p.get('type'), query = p.get('q') ?? '', page = Number(p.get('page') ?? '1')
  const status = p.get('status') ?? '', district = p.get('district') ?? '', health = p.get('health') ?? '', role = p.get('role') ?? ''
  if (!['places', 'users'].includes(type ?? '') || query.length > 120 || !Number.isSafeInteger(page) || page < 1 || page > 100000 || (status && !['published', 'draft', 'temporarily_closed', 'permanently_closed'].includes(status)) || (health && !ADMIN_HEALTH_FILTERS.includes(health as typeof ADMIN_HEALTH_FILTERS[number])) || (role && !['admin', 'owner', 'customer'].includes(role)) || district.length > 48) return json({ error: 'فیلتر یا صفحه معتبر نیست.' }, 400)
  try { return json(type === 'places' ? await getAdminPlaces({ query, page, status, district, health }) : await getAdminUsers({ query, page, role })) }
  catch { return json({ error: 'فهرست دریافت نشد؛ دوباره تلاش کنید.' }, 503) }
}
