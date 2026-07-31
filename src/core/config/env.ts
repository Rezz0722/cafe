import 'server-only'

/**
 * خواندن و اعتبارسنجی تنظیمات محیط.
 *
 * همه‌ی رازها **فقط** از اینجا خوانده می‌شوند و هیچ‌کدام `NEXT_PUBLIC_` نیستند،
 * پس هرگز به بسته‌ی کلاینت راه پیدا نمی‌کنند. `server-only` تضمین می‌کند که
 * اگر کسی اشتباهی این ماژول را در یک client component import کند، build
 * می‌شکند — نه اینکه بی‌صدا کلید API را به مرورگر بفرستد.
 */

function optional(name: string): string {
  return (process.env[name] ?? '').trim()
}

function bool(name: string, fallback = false): boolean {
  const v = optional(name).toLowerCase()
  if (!v) return fallback
  return v === 'true' || v === '1' || v === 'yes'
}

/**
 * حالت توسعه: پیامک ارسال نمی‌شود و کد در ترمینال چاپ می‌شود.
 *
 * پیش‌فرض روی «روشن» است مگر اینکه صریحاً خاموش شود. این عمدی است: اعتبار
 * پیامک پول واقعی است و یک حلقه‌ی تست می‌تواند در چند دقیقه تمامش کند.
 * برای تولید باید صریحاً `AUTH_DEV_MODE=false` بگذارید.
 */
export const AUTH_DEV_MODE = bool('AUTH_DEV_MODE', true)

export const SESSION_SECRET = optional('SESSION_SECRET')

export const SMSIR = {
  apiKey: optional('SMSIR_API_KEY'),
  templateId: optional('SMSIR_TEMPLATE_ID'),
  templateParam: optional('SMSIR_TEMPLATE_PARAM') || 'CODE',
  lineNumber: optional('SMSIR_LINE_NUMBER'),
}

/** شماره‌هایی که با اولین ورود، نقش admin می‌گیرند. */
export const ADMIN_PHONES: string[] = optional('ADMIN_PHONES')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

export interface ConfigProblem {
  key: string
  message: string
  fatal: boolean
}

/**
 * مشکلات تنظیمات را برمی‌گرداند تا در پنل ادمین دیده شوند.
 *
 * عمداً throw نمی‌کند: یک تنظیمِ ناقصِ پیامک نباید کل سایت را پایین بیاورد.
 * سایت عمومی بدون احراز هویت هم کار می‌کند.
 */
export function checkConfig(): ConfigProblem[] {
  const problems: ConfigProblem[] = []

  if (!SESSION_SECRET) {
    problems.push({
      key: 'SESSION_SECRET',
      message: 'تنظیم نشده — ورود کار نمی‌کند. یک رشته‌ی تصادفی ۳۲ بایتی بگذارید.',
      fatal: true,
    })
  } else if (SESSION_SECRET.length < 32) {
    problems.push({
      key: 'SESSION_SECRET',
      message: `فقط ${SESSION_SECRET.length} کاراکتر است؛ حداقل ۳۲ لازم است.`,
      fatal: true,
    })
  }

  if (!AUTH_DEV_MODE) {
    if (!SMSIR.apiKey) {
      problems.push({
        key: 'SMSIR_API_KEY',
        message: 'تنظیم نشده و حالت توسعه هم خاموش است — پیامکی ارسال نمی‌شود.',
        fatal: true,
      })
    }
    if (!SMSIR.templateId && !SMSIR.lineNumber) {
      problems.push({
        key: 'SMSIR_TEMPLATE_ID',
        message:
          'نه قالب OTP تعریف شده نه شماره خط. یکی لازم است — قالب توصیه می‌شود.',
        fatal: true,
      })
    }
  }

  if (AUTH_DEV_MODE) {
    problems.push({
      key: 'AUTH_DEV_MODE',
      message: 'روشن است: پیامک واقعی ارسال نمی‌شود و کد در ترمینال چاپ می‌شود.',
      fatal: false,
    })
  }

  if (!SMSIR.templateId && SMSIR.lineNumber) {
    problems.push({
      key: 'SMSIR_TEMPLATE_ID',
      message:
        'ارسال با خط عادی انجام می‌شود. برای OTP، قالب بسازید — خط OTP فیلتر نمی‌شود و تحویلش بهتر است.',
      fatal: false,
    })
  }

  return problems
}
