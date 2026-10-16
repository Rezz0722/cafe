import test from 'node:test'
import assert from 'node:assert/strict'
import { assertBookingTransition, isProposedTimePast } from './state'

const now = new Date('2026-10-16T09:00:00Z') // 12:30 Tehran

test('only an explicit venue response confirms a future request', () => {
  assert.doesNotThrow(() => assertBookingTransition('pending', 'confirmed', 'venue', '2026-10-17', '15:00', now))
  assert.throws(() => assertBookingTransition('pending', 'confirmed', 'customer', '2026-10-17', '15:00', now))
  assert.throws(() => assertBookingTransition('pending', 'confirmed', 'system', '2026-10-17', '15:00', now))
  assert.throws(() => assertBookingTransition('pending', 'confirmed', 'venue', '2026-10-15', '15:00', now))
})

test('customer cancellation, system expiry and completed visit have distinct rules', () => {
  assert.doesNotThrow(() => assertBookingTransition('pending', 'cancelled', 'customer', '2026-10-17', '15:00', now))
  assert.throws(() => assertBookingTransition('confirmed', 'cancelled', 'customer', '2026-10-17', '15:00', now))
  assert.equal(isProposedTimePast('2026-10-15', '15:00', now), true)
  assert.doesNotThrow(() => assertBookingTransition('pending', 'expired', 'system', '2026-10-15', '15:00', now))
  assert.throws(() => assertBookingTransition('pending', 'expired', 'system', '2026-10-17', '15:00', now))
  assert.doesNotThrow(() => assertBookingTransition('confirmed', 'completed', 'venue', '2026-10-15', '15:00', now))
  assert.throws(() => assertBookingTransition('pending', 'completed', 'venue', '2026-10-15', '15:00', now))
})
