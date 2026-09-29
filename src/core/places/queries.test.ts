import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isPublicPlaceStatus, PUBLIC_PLACE_STATUSES, listMyPlaceReviews } from './queries'

test('صفحه‌ی عمومی فقط مکان منتشرشده یا موقتاً بسته را می‌پذیرد', () => {
  assert.deepEqual(PUBLIC_PLACE_STATUSES, ['published', 'temporarily_closed'])
  assert.equal(isPublicPlaceStatus('published'), true)
  assert.equal(isPublicPlaceStatus('temporarily_closed'), true)
  assert.equal(isPublicPlaceStatus('draft'), false)
  assert.equal(isPublicPlaceStatus('permanently_closed'), false)
  assert.equal(isPublicPlaceStatus('merged'), false)
})

test('private review history fails closed for a missing authenticated user ID', async () => {
  assert.deepEqual(await listMyPlaceReviews('', 154), [])
})
