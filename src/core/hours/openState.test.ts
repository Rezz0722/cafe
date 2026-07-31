import assert from 'node:assert/strict'
import { test } from 'node:test'
import { computeOpenState, toPersianDow, toMinutes, fromMinutes } from './openState.ts'
import type { OpeningHour } from '../places/types.ts'

/** ساعت کاری یکنواخت برای هر هفت روز. */
function everyDay(opensAt: string, closesAt: string, crossesMidnight = false): OpeningHour[] {
  return Array.from({ length: 7 }, (_, dow) => ({
    dow,
    opensAt,
    closesAt,
    crossesMidnight,
    closed: false,
  }))
}

/** یک تاریخ مشخص می‌سازد. ماه در JS صفرمحور است. */
const at = (y: number, m: number, d: number, h: number, min = 0) => new Date(y, m - 1, d, h, min)

// ── تبدیل‌های پایه ───────────────────────────────────────────────────

test('toMinutes و fromMinutes معکوس هم‌اند', () => {
  assert.equal(toMinutes('09:30'), 570)
  assert.equal(fromMinutes(570), '09:30')
  assert.equal(fromMinutes(1500), '01:00') // بعد از نیمه‌شب wrap می‌شود
})

test('هفته‌ی ایرانی شنبه‌محور است', () => {
  // ۲۰۲۶-۰۸-۰۱ یک شنبه (Saturday) است
  assert.equal(toPersianDow(at(2026, 8, 1, 12)), 0)
  // ۲۰۲۶-۰۸-۰۲ یکشنبه (Sunday)
  assert.equal(toPersianDow(at(2026, 8, 2, 12)), 1)
  // ۲۰۲۶-۰۸-۰۷ جمعه (Friday)
  assert.equal(toPersianDow(at(2026, 8, 7, 12)), 6)
})

// ── حالت عادی ───────────────────────────────────────────────────────

test('وسط ساعت کاری باز است', () => {
  const state = computeOpenState(everyDay('09:00', '23:00'), [], at(2026, 8, 1, 14))
  assert.equal(state.isOpen, true)
  assert.match(state.subLabel, /23:00/)
})

test('قبل از باز شدن، بسته است و زمان باز شدن را می‌گوید', () => {
  const state = computeOpenState(everyDay('09:00', '23:00'), [], at(2026, 8, 1, 7))
  assert.equal(state.isOpen, false)
  assert.match(state.subLabel, /09:00/)
})

test('بعد از بستن، بسته است', () => {
  const state = computeOpenState(everyDay('09:00', '23:00'), [], at(2026, 8, 1, 23, 30))
  assert.equal(state.isOpen, false)
})

// ── عبور از نیمه‌شب — جایی که پیاده‌سازی‌های ساده می‌شکنند ───────────

test('کافه‌ی ۱۷:۰۰ تا ۰۲:۰۰ ساعت ۱ بامداد هنوز باز است', () => {
  const hours = everyDay('17:00', '02:00', true)
  // ساعت ۰۱:۰۰ روز بعد — داخل بازه‌ی *دیروز*
  const state = computeOpenState(hours, [], at(2026, 8, 2, 1))
  assert.equal(state.isOpen, true)
})

test('کافه‌ی ۱۷:۰۰ تا ۰۲:۰۰ ساعت ۳ بامداد بسته است', () => {
  const hours = everyDay('17:00', '02:00', true)
  const state = computeOpenState(hours, [], at(2026, 8, 2, 3))
  assert.equal(state.isOpen, false)
})

test('کافه‌ی ۱۷:۰۰ تا ۰۲:۰۰ ساعت ۲۳ همان شب باز است', () => {
  const hours = everyDay('17:00', '02:00', true)
  const state = computeOpenState(hours, [], at(2026, 8, 1, 23))
  assert.equal(state.isOpen, true)
})

// ── روز تعطیل ───────────────────────────────────────────────────────

test('روز تعطیل بسته است و روز باز بعدی را می‌گوید', () => {
  const hours = everyDay('09:00', '22:00').map((h) =>
    h.dow === 0 ? { ...h, closed: true } : h,
  )
  const state = computeOpenState(hours, [], at(2026, 8, 1, 14)) // شنبه
  assert.equal(state.isOpen, false)
  assert.match(state.subLabel, /فردا/)
})

// ── استثناها — تعطیلات رسمی و ماه رمضان ─────────────────────────────

test('استثنای تعطیلی، ساعت کاری عادی را نادیده می‌گیرد', () => {
  const state = computeOpenState(
    everyDay('09:00', '23:00'),
    [{ date: '2026-08-01', closed: true, reason: 'تعطیل رسمی' }],
    at(2026, 8, 1, 14),
  )
  assert.equal(state.isOpen, false)
})

test('استثنا می‌تواند ساعت متفاوت بدهد — مثل ماه رمضان', () => {
  const state = computeOpenState(
    everyDay('09:00', '23:00'),
    [{ date: '2026-08-01', closed: false, opensAt: '19:00', closesAt: '23:59' }],
    at(2026, 8, 1, 14), // ساعت ۱۴ که عادتاً باز است
  )
  assert.equal(state.isOpen, false, 'در رمضان ظهر بسته است')

  const evening = computeOpenState(
    everyDay('09:00', '23:00'),
    [{ date: '2026-08-01', closed: false, opensAt: '19:00', closesAt: '23:59' }],
    at(2026, 8, 1, 20),
  )
  assert.equal(evening.isOpen, true, 'شب باز است')
})

// ── حالت‌های مرزی ───────────────────────────────────────────────────

test('نبود ساعت کاری کرش نمی‌کند', () => {
  const state = computeOpenState([], [], at(2026, 8, 1, 14))
  assert.equal(state.isOpen, false)
  assert.equal(state.label, 'ساعت کاری ثبت نشده')
})

test('همه‌ی روزها تعطیل — حلقه‌ی جست‌وجوی روز بعدی بی‌نهایت نمی‌شود', () => {
  const hours = everyDay('09:00', '22:00').map((h) => ({ ...h, closed: true }))
  const state = computeOpenState(hours, [], at(2026, 8, 1, 14))
  assert.equal(state.isOpen, false)
})
