/**
 * تست «الان باز است؟».
 *
 * همه‌ی زمان‌ها با `at` تزریق می‌شوند، وگرنه تستِ «نیمه‌شب باز است» فقط
 * نیمه‌شب سبز می‌شد.
 *
 * ساخت زمان تهران در تست: `Date` را با افست `+03:30` می‌سازیم تا مستقل از
 * منطقه‌ی زمانی ماشینِ CI باشد.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { computeOpenState, tehranNow, weekSchedule, type HourShift } from './openNow'

/** یک لحظه به وقت تهران. `iso` مثل `'2026-08-05T14:30'` */
function tehran(iso: string): Date {
  return new Date(`${iso}:00+03:30`)
}

const shift = (
  dow: number,
  opensAt: string,
  closesAt: string,
  shiftIndex = 0,
  crossesMidnight = false,
): HourShift => ({ dow, shiftIndex, opensAt, closesAt, crossesMidnight, closed: false })

const closedDay = (dow: number): HourShift => ({
  dow,
  shiftIndex: 0,
  opensAt: null,
  closesAt: null,
  crossesMidnight: false,
  closed: true,
})

// ── ۵ آگوست ۲۰۲۶ چهارشنبه است → dow ایرانی = ۴
test('tehranNow روز هفته‌ی ایرانی را درست می‌دهد', () => {
  assert.equal(tehranNow(tehran('2026-08-05T12:00')).dow, 4, 'چهارشنبه')
  assert.equal(tehranNow(tehran('2026-08-08T12:00')).dow, 0, 'شنبه')
  assert.equal(tehranNow(tehran('2026-08-07T12:00')).dow, 6, 'جمعه')
  assert.equal(tehranNow(tehran('2026-08-06T12:00')).dow, 5, 'پنجشنبه')
})

test('tehranNow دقیقه را درست می‌دهد', () => {
  const now = tehranNow(tehran('2026-08-05T14:30'))
  assert.equal(now.minutes, 14 * 60 + 30)
})

test('tehranNow مستقل از منطقه‌ی زمانی سرور است', () => {
  // همان لحظه، نوشته‌شده به UTC: ۱۱:۰۰ UTC = ۱۴:۳۰ تهران
  const now = tehranNow(new Date('2026-08-05T11:00:00Z'))
  assert.equal(now.minutes, 14 * 60 + 30)
})

// ── وضعیت پایه

test('در ساعت کاری، باز است', () => {
  const state = computeOpenState([shift(4, '09:00', '23:00')], tehran('2026-08-05T14:30'))
  assert.equal(state.status, 'open')
  assert.equal(state.label, 'تا 23:00 باز است')
  assert.equal(state.minutesToClose, 8 * 60 + 30)
})

test('قبل از باز شدن، بسته است و زمان باز شدن را می‌گوید', () => {
  const state = computeOpenState([shift(4, '09:00', '23:00')], tehran('2026-08-05T07:00'))
  assert.equal(state.status, 'closed')
  assert.match(state.label, /09:00/)
  assert.equal(state.subLabel, 'امروز')
})

test('نزدیک بستن، هشدار می‌دهد', () => {
  const state = computeOpenState([shift(4, '09:00', '23:00')], tehran('2026-08-05T22:30'))
  assert.equal(state.status, 'open')
  assert.equal(state.subLabel, 'کمتر از یک ساعت تا بستن')
})

// ── شیفت شکسته — دلیل وجود این ماژول

test('بین دو شیفت، بسته است', () => {
  // «شنبه: 12:00-16:30 و 20:00-23:30» — ساعت ۱۸ باید بسته باشد.
  const shifts = [shift(4, '12:00', '16:30', 0), shift(4, '20:00', '23:30', 1)]
  const state = computeOpenState(shifts, tehran('2026-08-05T18:00'))
  assert.equal(state.status, 'closed', 'مدل تک‌بازه‌ای اینجا اشتباه «باز» می‌گفت')
  // ساعت باز شدنِ شیفت بعد در برچسب اصلی می‌آید، چون همان چیزی است که
  // کاربر دنبالش است: «کِی باز می‌شود».
  assert.match(state.label, /20:00/)
  assert.equal(state.subLabel, 'امروز')
})

test('در شیفت اول باز است و شیفت دوم را خبر می‌دهد', () => {
  const shifts = [shift(4, '12:00', '16:30', 0), shift(4, '20:00', '23:30', 1)]
  const state = computeOpenState(shifts, tehran('2026-08-05T13:00'))
  assert.equal(state.status, 'open')
  assert.equal(state.label, 'تا 16:30 باز است')
  assert.match(state.subLabel, /20:00 دوباره باز/)
})

test('در شیفت دوم باز است', () => {
  const shifts = [shift(4, '12:00', '16:30', 0), shift(4, '20:00', '23:30', 1)]
  const state = computeOpenState(shifts, tehran('2026-08-05T21:00'))
  assert.equal(state.status, 'open')
  assert.equal(state.label, 'تا 23:30 باز است')
})

// ── گذر از نیمه‌شب

test('بعد از نیمه‌شب، شیفتِ دیروز هنوز باز است', () => {
  // «مجنون لانژ»: چهارشنبه ۱۶:۰۰ تا ۰۰:۳۰ — ساعت ۰۰:۱۵ پنجشنبه باید باز باشد.
  const shifts = [shift(4, '16:00', '00:30', 0, true)]
  const state = computeOpenState(shifts, tehran('2026-08-06T00:15'))
  assert.equal(state.status, 'open')
  assert.equal(state.label, 'تا 00:30 باز است')
  assert.equal(state.minutesToClose, 15)
})

test('بعد از بسته‌شدنِ شیفتِ نیمه‌شبی، بسته است', () => {
  const shifts = [shift(4, '16:00', '00:30', 0, true)]
  const state = computeOpenState(shifts, tehran('2026-08-06T01:00'))
  assert.notEqual(state.status, 'open')
})

test('ساعت ۲۴:۰۰ منبع (یعنی ۰۰:۰۰) درست کار می‌کند', () => {
  // پارسر `08:00-24:00` را به `08:00-00:00` با گذر از نیمه‌شب تبدیل می‌کند.
  const shifts = [shift(4, '08:00', '00:00', 0, true)]
  const state = computeOpenState(shifts, tehran('2026-08-05T23:30'))
  assert.equal(state.status, 'open')
  assert.equal(state.minutesToClose, 30)
})

// ── نامشخص در برابر تعطیل

test('بدون ساعت کاری، نامشخص است نه تعطیل', () => {
  const state = computeOpenState([], tehran('2026-08-05T14:00'))
  assert.equal(state.status, 'unknown')
  assert.match(state.label, /ثبت نشده/)
})

test('روزِ ثبت‌نشده «تعطیل» اعلام نمی‌شود', () => {
  // فقط شنبه ثبت شده؛ امروز چهارشنبه است. «بسته» گفتن دروغ است.
  const state = computeOpenState([shift(0, '09:00', '22:00')], tehran('2026-08-05T14:00'))
  assert.equal(state.status, 'unknown')
})

test('روزِ صریحاً تعطیل، بسته اعلام می‌شود', () => {
  const shifts = [closedDay(4), shift(5, '09:00', '22:00')]
  const state = computeOpenState(shifts, tehran('2026-08-05T14:00'))
  assert.equal(state.status, 'closed')
  assert.match(state.subLabel, /فردا/)
})

test('همه‌ی روزها تعطیل → تعطیل', () => {
  const shifts = [0, 1, 2, 3, 4, 5, 6].map(closedDay)
  const state = computeOpenState(shifts, tehran('2026-08-05T14:00'))
  assert.equal(state.status, 'closed')
  assert.equal(state.label, 'تعطیل')
})

// ── جدول هفته

test('weekSchedule هفت روز از شنبه می‌دهد', () => {
  const schedule = weekSchedule([shift(0, '09:00', '22:00')], tehran('2026-08-05T14:00'))
  assert.equal(schedule.length, 7)
  assert.equal(schedule[0]!.dayName, 'شنبه')
  assert.equal(schedule[6]!.dayName, 'جمعه')
})

test('weekSchedule شیفت‌های یک روز را کنار هم می‌گذارد', () => {
  const shifts = [shift(0, '12:00', '16:30', 0), shift(0, '20:00', '23:30', 1)]
  const schedule = weekSchedule(shifts, tehran('2026-08-05T14:00'))
  assert.deepEqual(schedule[0]!.ranges, ['12:00–16:30', '20:00–23:30'])
})

test('weekSchedule امروز را علامت می‌زند', () => {
  const schedule = weekSchedule([shift(4, '09:00', '22:00')], tehran('2026-08-05T14:00'))
  assert.equal(schedule[4]!.isToday, true, 'چهارشنبه')
  assert.equal(schedule[0]!.isToday, false)
})

test('weekSchedule تعطیل و نامشخص را از هم جدا می‌کند', () => {
  const schedule = weekSchedule([closedDay(6), shift(0, '09:00', '22:00')], tehran('2026-08-05T14:00'))
  assert.equal(schedule[6]!.closed, true, 'جمعه صریحاً تعطیل')
  assert.equal(schedule[6]!.unknown, false)
  assert.equal(schedule[1]!.unknown, true, 'یکشنبه ثبت نشده')
  assert.equal(schedule[1]!.closed, false)
})
