import { toEnDigits } from '@/lib/format'

const persianParts = new Intl.DateTimeFormat('en-US-u-ca-persian', {
  timeZone: 'UTC',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
})

function partsOf(date: Date) {
  const parts = persianParts.formatToParts(date)
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0)
  return { year: value('year'), month: value('month'), day: value('day') }
}

function validGregorian(year: number, month: number, day: number): string | null {
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31) return null
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return date.toISOString().slice(0, 10)
}

/** تاریخ شمسی فرم (`۱۴۰۵/۰۶/۲۱`) یا ISO قدیمی را به تاریخ دیتابیس تبدیل می‌کند. */
export function parseVisitDate(value: string | null | undefined): string | null {
  const normalized = toEnDigits(value ?? '').trim().replace(/[.\-]/g, '/')
  if (!normalized) return null
  const match = normalized.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])

  if (year >= 1900) return validGregorian(year, month, day)
  if (year < 1200 || year > 1700 || month < 1 || month > 12 || day < 1 || day > 31) return null

  // آغاز سال شمسی همیشه حوالی ۲۰/۲۱ مارس است. جست‌وجوی این بازه از یک
  // الگوریتم تقویمی دست‌ساز مطمئن‌تر است و `Intl` خودِ runtime منبع حقیقت است.
  const candidate = new Date(Date.UTC(year + 621, 2, 18))
  for (let offset = 0; offset < 370; offset++) {
    const parts = partsOf(candidate)
    if (parts.year === year && parts.month === month && parts.day === day) {
      return candidate.toISOString().slice(0, 10)
    }
    candidate.setUTCDate(candidate.getUTCDate() + 1)
  }
  return null
}

/** تاریخ ذخیره‌شده را برای ورودی فارسی به تقویم شمسی نمایش می‌دهد. */
export function formatVisitDate(value: Date | string | null | undefined, timeZone = 'UTC'): string {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}
