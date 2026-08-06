/**
 * ثبت بازدید — `POST /api/track`
 *
 * ═══ چرا یک endpoint و نه ثبت در خودِ صفحه ═══
 *
 * ثبت در server component یعنی هر بازدیدِ کش‌شده ثبت نمی‌شود (چون صفحه از
 * کش می‌آید و کدش اجرا نمی‌شود) و هر رندرِ دوباره‌ی سرور ثبتِ تکراری می‌سازد.
 * یک درخواست از مرورگر، دقیقاً یک بازدیدِ واقعی است.
 *
 * ═══ چرا کوکی بازدیدکننده اینجا ست می‌شود ═══
 *
 * در App Router نمی‌شود از داخل رندرِ یک صفحه کوکی نوشت. یک route handler
 * می‌تواند، پس اولین درخواستِ ثبت، کوکی را می‌سازد.
 */

import { cookies } from 'next/headers'
import { getCurrentUser } from '@/core/auth/currentUser'
import { newVisitorId, trackPageView, VISITOR_COOKIE } from '@/core/analytics/track'
import { getSettings } from '@/core/settings/store'

/** یک سال — شمارشِ «یکتا» در بازه‌ی سالانه معنی دارد. */
const VISITOR_MAX_AGE = 365 * 24 * 3600

export async function POST(request: Request): Promise<Response> {
  let payload: { path?: unknown; referrer?: unknown }
  try {
    payload = await request.json()
  } catch {
    return new Response(null, { status: 204 })
  }

  const path = typeof payload.path === 'string' ? payload.path : ''
  // مسیر باید داخلی باشد؛ ورودیِ دلخواه یعنی جدولِ آمار قابل آلوده‌کردن است.
  if (!path.startsWith('/') || path.length > 300) return new Response(null, { status: 204 })

  /*
    ثبت بازدید می‌تواند از پنل ادمین خاموش شود. بررسی **قبل** از ساختن کوکی
    است: اگر آمار خاموش است، کوکیِ بازدیدکننده هم نباید ساخته شود.
  */
  const settings = await getSettings()
  if (!settings.trackPageViews) return new Response(null, { status: 204 })

  const store = await cookies()
  let visitorId = store.get(VISITOR_COOKIE)?.value ?? null
  let isNew = false
  if (!visitorId || visitorId.length !== 36) {
    visitorId = newVisitorId()
    isNew = true
  }

  const user = await getCurrentUser()
  const placeSlug = path.startsWith('/cafe/') ? path.slice('/cafe/'.length).split('/')[0]! : null

  try {
    await trackPageView(
      {
        path,
        visitorId,
        userId: user?.id ?? null,
        referrer: typeof payload.referrer === 'string' ? payload.referrer : null,
        userAgent: request.headers.get('user-agent'),
        placeSlug,
      },
      { enabled: true, countBots: settings.countBotsInStats },
    )
  } catch (error) {
    // شکستِ ثبتِ آمار **هرگز** نباید به کاربر برسد. آمار مهم است، ولی نه به
    // قیمتِ خرابیِ صفحه.
    console.warn('[track] failed', error)
  }

  const response = new Response(null, { status: 204 })
  if (isNew) {
    response.headers.append(
      'Set-Cookie',
      `${VISITOR_COOKIE}=${visitorId}; Path=/; Max-Age=${VISITOR_MAX_AGE}; HttpOnly; SameSite=Lax${
        process.env.NODE_ENV === 'production' ? '; Secure' : ''
      }`,
    )
  }
  return response
}
