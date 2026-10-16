import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { clockMinute, hashBookingDraft, normalizeBookingDraft, tehranCivilNow, validLocalDate, validateBookingWindow } from './policy'

const now = new Date('2026-10-16T09:00:00Z') // 12:30 Asia/Tehran
const window = { requestFrom: '09:00:00', requestUntil: '22:00:00', maxPartySize: 12, minNoticeMinutes: 60, maxAdvanceDays: 30 }
const draft = () => ({ placeId: 12, kind: 'birthday' as const, requestedDate: '2026-10-16',
  requestedLocalTime: '15:00', partySize: 8, durationMinutes: 120,
  customerNote: ' جشن  ', termsAccepted: true, idempotencyKey: randomUUID(), items: [{ itemId: 1, variantId: 2, quantity: 2 }] })

test('Tehran civil time and strict calendar parsing', () => {
  assert.deepEqual(tehranCivilNow(now), { date: '2026-10-16', minuteOfDay: 750 })
  assert.equal(validLocalDate('2026-02-29'), false)
  assert.equal(validLocalDate('2028-02-29'), true)
  assert.equal(clockMinute('23:59:00'), 1439)
  assert.equal(clockMinute('24:00'), null)
})

test('booking window never implies capacity and must be explicitly valid', () => {
  validateBookingWindow(window)
  assert.throws(() => validateBookingWindow({ ...window, requestFrom: null }))
  assert.throws(() => validateBookingWindow({ ...window, maxPartySize: 0 }))
  assert.throws(() => validateBookingWindow({ ...window, requestUntil: '08:00' }))
})

test('booking draft rejects past, far future, invalid party and menu intents', () => {
  const normalized = normalizeBookingDraft(draft(), window, now)
  assert.equal(normalized.customerNote, 'جشن')
  assert.equal(normalized.requestedLocalTime, '15:00')
  assert.equal(hashBookingDraft(normalized).length, 64)
  assert.throws(() => normalizeBookingDraft({ ...draft(), requestedDate: '2026-10-15' }, window, now))
  assert.throws(() => normalizeBookingDraft({ ...draft(), requestedDate: '2026-12-20' }, window, now))
  assert.throws(() => normalizeBookingDraft({ ...draft(), requestedLocalTime: '12:45' }, window, now))
  assert.throws(() => normalizeBookingDraft({ ...draft(), requestedLocalTime: '22:30' }, window, now))
  assert.throws(() => normalizeBookingDraft({ ...draft(), partySize: 13 }, window, now))
  assert.throws(() => normalizeBookingDraft({ ...draft(), items: [{ itemId: 1, quantity: 1 }, { itemId: 1, quantity: 1 }] }, window, now))
  assert.throws(() => normalizeBookingDraft({ ...draft(), items: [{ itemId: 1, quantity: 11 }] }, window, now))
  assert.throws(() => normalizeBookingDraft({ ...draft(), idempotencyKey: 'not-a-uuid' }, window, now))
  assert.throws(() => normalizeBookingDraft({ ...draft(), termsAccepted: false }, window, now))
})
