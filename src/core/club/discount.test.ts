import test from 'node:test'
import assert from 'node:assert/strict'
import { discountedPrice, parseDiscountExpiry } from './discount'
test('discount preserves unknown price and validates percentage', () => {
  assert.equal(discountedPrice(null,20),null)
  assert.equal(discountedPrice(100000,20),80000)
  assert.equal(discountedPrice(100000,100),100000)
  assert.equal(discountedPrice(0,10),0)
})
test('discount deadline is future and Iran-local', () => {
  const now = new Date('2026-09-16T00:00:00Z')
  assert.equal(parseDiscountExpiry('2026-09-17T12:00',now).toISOString(),'2026-09-17T08:30:00.000Z')
  assert.throws(()=>parseDiscountExpiry('2026-09-15T12:00',now))
  assert.throws(()=>parseDiscountExpiry('bad',now))
  assert.throws(()=>parseDiscountExpiry('2027-02-31T12:00',now))
})
