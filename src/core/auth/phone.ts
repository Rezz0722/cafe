/**
 * نرمال‌سازی و اعتبارسنجی شماره موبایل ایران.
 *
 * کاربر شماره را به شکل‌های مختلفی می‌نویسد: «۰۹۱۵…» با ارقام فارسی،
 * «+98915…»، «0098915…»، با فاصله یا خط تیره. همه باید به یک شکل کانونی
 * برسند، وگرنه یک نفر با دو نوشتار، دو حساب کاربری می‌سازد.
 */

import { toAsciiDigits } from '@/core/text/normalize'

/** شکل کانونی: 09xxxxxxxxx */
export function normalizePhone(input: string): string | null {
  if (!input) return null

  let d = toAsciiDigits(String(input)).replace(/\D/g, '')

  if (d.startsWith('0098')) d = d.slice(4)
  else if (d.startsWith('98')) d = d.slice(2)

  if (d.startsWith('0')) d = d.slice(1)

  // باید ۱۰ رقم باشد و با ۹ شروع شود
  if (d.length !== 10 || !d.startsWith('9')) return null

  return `0${d}`
}

export function isValidPhone(input: string): boolean {
  return normalizePhone(input) !== null
}

/** «۰۹۱۵***۴۵۶۷» — برای نمایش در UI بدون لو دادن کل شماره. */
export function maskPhone(phone: string): string {
  const p = normalizePhone(phone)
  if (!p) return ''
  return `${p.slice(0, 4)}***${p.slice(7)}`
}
