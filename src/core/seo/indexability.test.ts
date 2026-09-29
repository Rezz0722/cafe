import test from 'node:test'
import assert from 'node:assert/strict'
import { isIndexable, isIndexableMenuItem, robotsFor } from './indexability'
import { BRAND_ALIASES } from './brand'

test('collection index boundary and follow remain consistent', () => {
  for (const n of [0, 1, 4]) assert.equal(isIndexable(n), false)
  assert.equal(isIndexable(5), true)
  assert.deepEqual(robotsFor(4), { index: false, follow: true })
  assert.deepEqual(robotsFor(5), { index: true, follow: true })
})
test('an image or food mapping alone must not open item indexation', () => {
  assert.equal(isIndexableMenuItem(true, null), false)
  assert.equal(isIndexableMenuItem(false, 'a'.repeat(100)), false)
  assert.equal(isIndexableMenuItem(true, ' a '), false)
  assert.equal(isIndexableMenuItem(true, 'a'.repeat(40)), true)
  assert.equal(isIndexableMenuItem(false, null, 3), true)
  assert.equal(isIndexableMenuItem(false, null, 2), false)
})
test('distinct Latin identity precedes ambiguous spelling', () => {
  assert.equal(BRAND_ALIASES[0], 'KuCafe')
  assert.ok(BRAND_ALIASES.includes('کوکافه'))
})
