/**
 * محاسبه‌ی باز/بسته بودن.
 *
 * نسخه‌ی قبلی `isOpen: boolean` را *ذخیره* می‌کرد. هر مقدار ذخیره‌شده‌ای که
 * به زمان وابسته است، از لحظه‌ی نوشتن شروع به بیات‌شدن می‌کند. اینجا همیشه
 * در لحظه محاسبه می‌شود.
 *
 * استثناها اختیاری نیستند: تعطیلات رسمی زیاد است و ساعت کاری کافه‌ها در ماه
 * رمضان کاملاً عوض می‌شود. دایرکتوری‌ای که این را نداند، بخشی از سال به
 * کاربرانش اطلاعات غلط می‌دهد.
 */

import type { HoursException, OpeningHour } from '@/core/places/types'
import { WEEKDAY_LABELS } from './weekdays'

/** «HH:MM» → دقیقه از نیمه‌شب. */
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

/** دقیقه از نیمه‌شب → «HH:MM». */
export function fromMinutes(total: number): string {
  const wrapped = ((total % 1440) + 1440) % 1440
  const h = Math.floor(wrapped / 60)
  const m = wrapped % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** `Date#getDay` یکشنبه‌محور است؛ هفته‌ی ایرانی شنبه‌محور. */
export function toPersianDow(date: Date): number {
  return (date.getDay() + 1) % 7
}

/** «YYYY-MM-DD» محلی (نه UTC — مرز روز باید محلی باشد). */
function localDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export interface OpenState {
  isOpen: boolean
  label: string
  subLabel: string
}

/**
 * بازه‌ی مؤثر یک روز را برمی‌گرداند، با اعمال استثنا.
 * `null` یعنی آن روز تعطیل است.
 */
function effectiveWindow(
  dow: number,
  dateKey: string,
  hours: OpeningHour[],
  exceptions: HoursException[],
): { open: number; close: number } | null {
  const exception = exceptions.find((e) => e.date === dateKey)

  if (exception) {
    if (exception.closed) return null
    if (exception.opensAt && exception.closesAt) {
      const open = toMinutes(exception.opensAt)
      let close = toMinutes(exception.closesAt)
      if (close <= open) close += 1440
      return { open, close }
    }
  }

  const rule = hours.find((h) => h.dow === dow)
  if (!rule || rule.closed) return null

  const open = toMinutes(rule.opensAt)
  let close = toMinutes(rule.closesAt)
  if (rule.crossesMidnight || close <= open) close += 1440

  return { open, close }
}

/**
 * وضعیت باز/بسته در یک لحظه‌ی مشخص.
 *
 * بازه‌ی دیروز هم بررسی می‌شود، چون کافه‌ای که ۱۰:۰۰ تا ۰۲:۰۰ باز است، ساعت
 * ۰۱:۰۰ امروز هنوز داخل بازه‌ی *دیروز* است.
 */
export function computeOpenState(
  hours: OpeningHour[],
  exceptions: HoursException[] = [],
  now: Date = new Date(),
): OpenState {
  if (!hours.length) {
    return { isOpen: false, label: 'ساعت کاری ثبت نشده', subLabel: '' }
  }

  const dow = toPersianDow(now)
  const minutes = now.getHours() * 60 + now.getMinutes()

  // ── بازه‌ی امروز ──
  const today = effectiveWindow(dow, localDateKey(now), hours, exceptions)
  if (today && minutes >= today.open && minutes < today.close) {
    return {
      isOpen: true,
      label: 'باز است',
      subLabel: `تا ${fromMinutes(today.close)}`,
    }
  }

  // ── ادامه‌ی بازه‌ی دیروز (بعد از نیمه‌شب) ──
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const prev = effectiveWindow(
    toPersianDow(yesterday),
    localDateKey(yesterday),
    hours,
    exceptions,
  )
  if (prev && prev.close > 1440 && minutes < prev.close - 1440) {
    return {
      isOpen: true,
      label: 'باز است',
      subLabel: `تا ${fromMinutes(prev.close)}`,
    }
  }

  // ── بسته: بعدی کِی باز می‌شود ──
  if (today && minutes < today.open) {
    return {
      isOpen: false,
      label: 'بسته است',
      subLabel: `${fromMinutes(today.open)} باز می‌شود`,
    }
  }

  for (let step = 1; step <= 7; step += 1) {
    const future = new Date(now)
    future.setDate(future.getDate() + step)
    const futureDow = toPersianDow(future)
    const window = effectiveWindow(futureDow, localDateKey(future), hours, exceptions)
    if (window) {
      const dayLabel = step === 1 ? 'فردا' : WEEKDAY_LABELS[futureDow]
      return {
        isOpen: false,
        label: 'بسته است',
        subLabel: `${dayLabel} ${fromMinutes(window.open)} باز می‌شود`,
      }
    }
  }

  return { isOpen: false, label: 'بسته است', subLabel: '' }
}

/** آیا این مکان تا فلان ساعت باز می‌ماند؟ پشتوانه‌ی فیلتر «باز تا نیمه‌شب». */
export function staysOpenUntil(
  hours: OpeningHour[],
  hhmm: string,
  now: Date = new Date(),
): boolean {
  const dow = toPersianDow(now)
  const window = effectiveWindow(dow, localDateKey(now), hours, [])
  if (!window) return false
  return window.close >= toMinutes(hhmm)
}
