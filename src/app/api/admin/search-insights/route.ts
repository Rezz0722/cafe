import { NextResponse } from 'next/server'
import { getSession } from '@/core/auth/currentUser'
import { findUserById } from '@/core/auth/userRepo'
import { VIEW_AS_READONLY } from '@/core/auth/impersonation'
import { getSearchInsights } from '@/core/analytics/searchInsights'

export const dynamic = 'force-dynamic'

function json(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store, max-age=0' } })
}

export async function GET() {
  const { user, actor } = await getSession()
  if (!user) return json({ error: 'ابتدا وارد شوید.' }, 401)
  if (actor) return json({ error: VIEW_AS_READONLY }, 403)
  if (user.role !== 'admin') return json({ error: 'دسترسی ندارید.' }, 403)
  const account = await findUserById(user.id)
  if (!account || account.blocked || account.mustChangePassword) {
    return json({ error: 'ابتدا امنیت حساب را تکمیل کنید.' }, 403)
  }
  try {
    const snapshot = await getSearchInsights()
    return json({ rows: snapshot.value, generatedAt: new Date(snapshot.generatedAt).toISOString() })
  } catch (error) {
    console.error('[admin/search-insights] report failed', error)
    return json({ error: 'گزارش آماده نشد؛ کمی بعد دوباره تلاش کنید.' }, 503)
  }
}
