import test from 'node:test'
import assert from 'node:assert/strict'
import { eventHasEnded, normalizeEventDraft, type EventDraft } from './policy'

const now = new Date('2026-10-16T09:00:00Z')
const event: EventDraft = {
  placeId: 10, title: 'شب موسیقی زنده', description: 'اجرای موسیقی زنده با هماهنگی قبلی در کافهٔ میزبان.',
  startDate: '2026-10-17', startLocalTime: '18:00', endDate: '2026-10-17', endLocalTime: '20:00',
  category: 'music', capacity: null, terms: null, participationMode: 'request', coverMediaId: null,
}

test('event dates are Tehran civil time, future-only and ordered', () => {
  assert.equal(normalizeEventDraft(event, now).startLocalTime, '18:00')
  assert.equal(eventHasEnded('2026-10-16', '12:31', now), false)
  assert.equal(eventHasEnded('2026-10-16', '12:30', new Date('2026-10-16T09:01:00Z')), true)
  assert.throws(() => normalizeEventDraft({ ...event, startDate: '2026-10-15' }, now))
  assert.throws(() => normalizeEventDraft({ ...event, endLocalTime: '17:00' }, now))
  assert.throws(() => normalizeEventDraft({ ...event, capacity: 0 }, now))
  assert.throws(() => normalizeEventDraft({ ...event, capacity: 5001 }, now))
  assert.equal(normalizeEventDraft({ ...event, capacity: 0 + 25 }, now).capacity, 25)
})
