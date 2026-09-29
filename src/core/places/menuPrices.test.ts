import test from 'node:test'
import assert from 'node:assert/strict'
import { adjustedPrice, parsePriceSelection } from './menuPrices'
test('price adjustment rounds predictably, preserves free prices and rejects unsafe inputs', () => {
  assert.equal(adjustedPrice(100000, 15), 115000)
  assert.equal(adjustedPrice(333000, -10), 300000)
  assert.equal(adjustedPrice(0, 20), 0)
  for (const percent of [0, -91, 201, NaN]) assert.throws(() => adjustedPrice(100000, percent))
  assert.throws(() => adjustedPrice(2147483647, 200))
})
test('bulk selection rejects empty, malformed or noninteger IDs instead of falling back to all', () => {
  assert.deepEqual(parsePriceSelection('items', '', '[12,12,13]'), { scope: 'items', itemIds: [12,13] })
  assert.deepEqual(parsePriceSelection('section', '12', ''), { scope: 'section', sectionId: 12 })
  for (const value of ['[]', '[0]', '["12"]', 'invalid']) assert.throws(() => parsePriceSelection('items', '', value))
  assert.throws(() => parsePriceSelection('section', '12.1', ''))
  assert.throws(() => parsePriceSelection('unknown', '', ''))
})
