import { NextRequest, NextResponse } from 'next/server'
import { requireAdminRead } from '@/core/admin/access'
import { queueConsoleMessage, readConsole } from '@/core/autonomy/consoleStore'
import { sameOrigin, validateConsoleMessage, validateConsoleMessageKind } from '@/core/autonomy/consolePolicy'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function json(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store, max-age=0' } })
}

async function admin() {
  const access = await requireAdminRead()
  if (!access.ok) return access
  if (access.user.role !== 'admin') return { ok: false as const, status: 403, error: 'فقط مدیر سیستم به ناظر دسترسی دارد.' }
  return access
}

export async function GET() {
  const access = await admin()
  if (!access.ok) return json({ error: access.error }, access.status)
  try { return json(await readConsole()) }
  catch { return json({ error: 'ارتباط با ناظر در دسترس نیست؛ وضعیت ساختگی نمایش داده نمی‌شود.' }, 503) }
}

export async function POST(request: NextRequest) {
  const access = await admin()
  if (!access.ok) return json({ error: access.error }, access.status)
  if (!sameOrigin(request.headers.get('origin'), process.env.NEXT_PUBLIC_SITE_URL)) return json({ error: 'مبدأ درخواست معتبر نیست.' }, 403)
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return json({ error: 'نوع درخواست معتبر نیست.' }, 415)
  const declaredSize = Number(request.headers.get('content-length') || '0')
  if (declaredSize > 4096) return json({ error: 'پیام بیش از حد مجاز است.' }, 413)
  let body: unknown
  try {
    const raw = await request.text()
    if (Buffer.byteLength(raw, 'utf8') > 4096) return json({ error: 'پیام بیش از حد مجاز است.' }, 413)
    body = JSON.parse(raw) as unknown
  } catch { return json({ error: 'بدنهٔ درخواست معتبر نیست.' }, 400) }
  const text = validateConsoleMessage(body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>).message : null)
  if (!text) return json({ error: 'پیام باید بین ۲ تا ۲۰۰۰ نویسه باشد.' }, 400)
  const kind = validateConsoleMessageKind(body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>).kind ?? 'question' : null)
  if (!kind) return json({ error: 'نوع درخواست معتبر نیست.' }, 400)
  try { return json({ ok: true, queued: await queueConsoleMessage(text, access.user.id, kind) }, 202) }
  catch (error) {
    if (error instanceof Error && error.message === 'too-many-pending') return json({ error: 'حداکثر پنج پیام بی‌پاسخ در صف است؛ پس از پاسخ‌گویی دوباره ارسال کنید.' }, 429)
    return json({ error: 'ثبت پیام ممکن نشد؛ دوباره تلاش کنید.' }, 503)
  }
}
