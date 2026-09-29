import { revalidatePath } from 'next/cache'
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/core/auth/currentUser'
import { findUserById } from '@/core/auth/userRepo'
import { VIEW_AS_READONLY } from '@/core/auth/impersonation'
import { recordAudit } from '@/core/places/manage'
import { startTopMenuSync,readTopMenuSyncSummary } from '@/core/sync/topMenuSync'
import {requireAdminRead} from '@/core/admin/access'
import { paths } from '@/routes'
import { parseTopMenuSelection } from '@/core/sync/topMenuSelection'

export const dynamic = 'force-dynamic'
export async function GET(){
 const access=await requireAdminRead();if(!access.ok)return NextResponse.json({error:access.error},{status:access.status,headers:{'Cache-Control':'private, no-store'}})
 const state=await readTopMenuSyncSummary()
 const {pid,actorUserId,...safe}=state
 return NextResponse.json(safe,{headers:{'Cache-Control':'private, no-store'}})
}

function json(body: { ok: boolean; message?: string; error?: string }, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  })
}

/**
 * endpoint پایدار برای کارهای طولانی TopMenuMarket.
 *
 * Server Action به شناسهٔ همان build وابسته است. ادمین ممکن است نیم ساعت
 * منتظر اسکرپ بماند و در این فاصله نسخهٔ تازه deploy شود؛ فرم قدیمی در آن
 * حالت شناسهٔ ناموجود می‌فرستد و React کل صفحه را با client exception می‌بندد.
 * URL این route بین buildها ثابت می‌ماند و خطایش هم JSON کنترل‌شده است.
 */
export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  const host = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
    || request.headers.get('host')
  let sameOrigin = false
  try {
    sameOrigin = Boolean(origin && host && new URL(origin).host === host)
  } catch {
    sameOrigin = false
  }
  if (!sameOrigin) {
    return json({ ok: false, error: 'درخواست نامعتبر است؛ صفحه را تازه کنید.' }, 403)
  }

  const { user, actor } = await getSession()
  if (!user) return json({ ok: false, error: 'ابتدا وارد شوید.' }, 401)
  if (actor) return json({ ok: false, error: VIEW_AS_READONLY }, 403)
  if (user.role !== 'admin') return json({ ok: false, error: 'دسترسی ندارید.' }, 403)
  const account = await findUserById(user.id)
  if (!account || account.mustChangePassword || account.blocked) {
    return json({ ok: false, error: 'ابتدا امنیت حساب را تکمیل کنید.' }, 403)
  }

  let payload: { mode?: unknown; confirm?: unknown; scope?: unknown; sourceIds?: unknown; runId?: unknown }
  try {
    if (Number(request.headers.get('content-length')) > 65536) return json({ ok: false, error: 'درخواست بیش از حد بزرگ است.' }, 413)
    const body = await request.text()
    if (body.length > 65536) return json({ ok: false, error: 'درخواست بیش از حد بزرگ است.' }, 413)
    payload = JSON.parse(body)
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('invalid payload')
  } catch {
    return json({ ok: false, error: 'اطلاعات درخواست قابل خواندن نیست.' }, 400)
  }

  const mode = payload.mode === 'scrape' || payload.mode === 'apply' ? payload.mode : null
  if (!mode) return json({ ok: false, error: 'نوع عملیات نامعتبر است.' }, 400)
  let selection
  try { selection = parseTopMenuSelection(payload.scope, payload.sourceIds) }
  catch (error) { return json({ ok: false, error: error instanceof Error ? error.message : 'انتخاب کافه نامعتبر است.' }, 400) }
  if (mode === 'apply' && (typeof payload.runId !== 'string' || !payload.runId)) return json({ ok: false, error: 'شناسه گزارش الزامی است؛ صفحه را تازه کنید.' }, 400)
  if (mode === 'apply' && payload.confirm !== 'همگام‌سازی کامل') {
    return json({ ok: false, error: 'برای تأیید، عبارت «همگام‌سازی کامل» را وارد کنید.' }, 400)
  }

  const adminActor = { userId: user.id, label: user.name || user.phone || user.id }
  try {
    const result = await startTopMenuSync(mode, adminActor, { selection, expectedRunId: mode === 'apply' ? payload.runId as string : undefined })
    if (!result.ok) return json({ ok: false, error: result.error }, 409)
    // شکست audit نباید پاسخ را «شروع نشد» اعلام کند؛ worker در این نقطه
    // واقعاً شروع شده و retry کاربر می‌تواند او را گیج کند.
    try {
      await recordAudit(
        adminActor,
        mode === 'scrape' ? 'topmenu.scrape_start' : 'topmenu.apply_start',
        'topmenu_sync',
        mode === 'scrape' ? 'pending' : 'current',
        { selection },
        null,
      )
    } catch (error) {
      console.warn('[topmenu-sync] audit failed after start', error)
    }
    revalidatePath(paths.admin)
    return json({
      ok: true,
      message: mode === 'scrape'
        ? (selection.scope === 'all' ? 'اسکرپ همهٔ کافه‌ها در پس‌زمینه شروع شد.' : `اسکرپ ${selection.sourceIds.length.toLocaleString('fa-IR')} کافهٔ انتخاب‌شده شروع شد.`)
        : 'بکاپ و همگام‌سازی کافه‌های انتخاب‌شده در پس‌زمینه شروع شد.',
    })
  } catch (error) {
    console.error('[topmenu-sync] failed to start', error)
    return json({ ok: false, error: 'شروع عملیات انجام نشد؛ گزارش بدون تغییر باقی ماند.' }, 500)
  }
}
