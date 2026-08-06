import 'server-only'

import { AUTH_DEV_MODE, SMSIR } from '@/core/config/env'

/**
 * کلاینت SMS.ir.
 *
 * دو روش ارسال پشتیبانی می‌شود، به این ترتیب اولویت:
 *
 *   ۱. `/v1/send/verify` با قالب — روش درست برای OTP. خط اختصاصی OTP
 *      فیلتر نمی‌شود و تحویلش سریع‌تر است. نیاز به ساخت قالب در پنل دارد.
 *   ۲. `/v1/send/bulk` با خط عادی — بدون قالب کار می‌کند، ولی برای OTP
 *      ایده‌آل نیست: ممکن است تأخیر بخورد یا فیلتر شود.
 *
 * و در حالت توسعه هیچ‌کدام: کد در ترمینال چاپ می‌شود. این پیش‌فرض است چون
 * اعتبار پیامک پول واقعی است و یک حلقه‌ی تست سریع تمامش می‌کند.
 */

const BASE = 'https://api.sms.ir'
const TIMEOUT_MS = 15_000

export type SendMethod = 'dev' | 'template' | 'bulk'

export interface SendResult {
  ok: boolean
  method: SendMethod
  /** پیام خطای قابل نمایش به کاربر — هرگز شامل کلید یا جزئیات داخلی. */
  error?: string
  /** جزئیات فنی برای لاگ سرور. */
  detail?: string
}

async function post(path: string, body: unknown): Promise<{ ok: boolean; status: number; json: any }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: {
        'X-API-KEY': SMSIR.apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: 'no-store',
    })

    const json = await res.json().catch(() => null)
    // SMS.ir حتی روی خطا هم گاهی HTTP 200 می‌دهد؛ `status: 1` معیار واقعی است.
    return { ok: res.ok && json?.status === 1, status: res.status, json }
  } finally {
    clearTimeout(timer)
  }
}

/** شماره را به شکلی که SMS.ir می‌پذیرد درمی‌آورد: 09xxxxxxxxx */
export function toSmsirMobile(phone: string): string {
  const d = phone.replace(/\D/g, '')
  if (d.startsWith('98')) return `0${d.slice(2)}`
  if (d.startsWith('0')) return d
  if (d.length === 10) return `0${d}`
  return d
}

/**
 * کد تأیید را ارسال می‌کند.
 *
 * هرگز throw نمی‌کند — خطای شبکه‌ی پیامک نباید ۵۰۰ بدهد؛ کاربر باید پیام
 * قابل‌فهم ببیند و بتواند دوباره تلاش کند.
 */
export interface SendOptions {
  /**
   * حالت توسعه از تنظیمات پنل ادمین می‌آید و بر `AUTH_DEV_MODE` مقدم است:
   * بیرون‌آوردن سایت از حالت توسعه نباید به ری‌دیپلوی نیاز داشته باشد.
   * وقتی داده نشود، همان پیش‌فرض env عمل می‌کند.
   */
  devMode?: boolean
  /** نام سایت در متن پیامکِ خط عادی. */
  siteName?: string
}

export async function sendVerificationCode(
  phone: string,
  code: string,
  options: SendOptions = {},
): Promise<SendResult> {
  const mobile = toSmsirMobile(phone)
  const devMode = options.devMode ?? AUTH_DEV_MODE
  const siteName = options.siteName?.trim() || 'کافه‌گرد'

  // ── حالت توسعه ──
  if (devMode) {
    console.log('')
    console.log('  ┌─────────────────────────────────────────┐')
    console.log(`  │  کد تأیید برای ${mobile.padEnd(13)}      │`)
    console.log(`  │            ${code}                        │`)
    console.log('  │  (حالت توسعه — پیامکی ارسال نشد)        │')
    console.log('  └─────────────────────────────────────────┘')
    console.log('')
    return { ok: true, method: 'dev' }
  }

  if (!SMSIR.apiKey) {
    return { ok: false, method: 'dev', error: 'سرویس پیامک تنظیم نشده است.' }
  }

  try {
    // ── روش ۱: قالب OTP ──
    if (SMSIR.templateId) {
      const { ok, json } = await post('/v1/send/verify', {
        mobile,
        templateId: Number(SMSIR.templateId),
        parameters: [{ name: SMSIR.templateParam, value: code }],
      })
      if (ok) return { ok: true, method: 'template' }
      return {
        ok: false,
        method: 'template',
        error: 'ارسال پیامک ناموفق بود. چند لحظه بعد دوباره تلاش کنید.',
        detail: `status=${json?.status} message=${json?.message}`,
      }
    }

    // ── روش ۲: خط عادی ──
    if (SMSIR.lineNumber) {
      const { ok, json } = await post('/v1/send/bulk', {
        lineNumber: Number(SMSIR.lineNumber),
        messageText: `${siteName}\nکد ورود شما: ${code}\nاین کد را در اختیار کسی قرار ندهید.`,
        mobiles: [mobile],
      })
      if (ok) return { ok: true, method: 'bulk' }
      return {
        ok: false,
        method: 'bulk',
        error: 'ارسال پیامک ناموفق بود. چند لحظه بعد دوباره تلاش کنید.',
        detail: `status=${json?.status} message=${json?.message}`,
      }
    }

    return { ok: false, method: 'dev', error: 'روش ارسال پیامک تنظیم نشده است.' }
  } catch (err) {
    return {
      ok: false,
      method: SMSIR.templateId ? 'template' : 'bulk',
      error: 'ارتباط با سرویس پیامک برقرار نشد.',
      detail: err instanceof Error ? err.message : String(err),
    }
  }
}

/** اعتبار باقی‌مانده — برای نمایش در پنل ادمین. رایگان است. */
export async function getCredit(): Promise<number | null> {
  if (!SMSIR.apiKey) return null
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    const res = await fetch(`${BASE}/v1/credit`, {
      headers: { 'X-API-KEY': SMSIR.apiKey, Accept: 'application/json' },
      signal: controller.signal,
      cache: 'no-store',
    })
    clearTimeout(timer)
    const json = await res.json()
    return typeof json?.data === 'number' ? json.data : null
  } catch {
    return null
  }
}
