import assert from 'node:assert/strict'
import test from 'node:test'
import { parseHomeDiscoveryEvent } from './tracking'

test('homepage analytics allow only bounded, non-sensitive contexts', () => {
  assert.deepEqual(parseHomeDiscoveryEvent({ event: 'review_card_opened', source: 'trusted_reviews', context: '123' })?.placeId, 123)
  assert.equal(parseHomeDiscoveryEvent({ event: 'review_card_opened', source: 'trusted_reviews', context: 'name@example.com' }), null)
  assert.equal(parseHomeDiscoveryEvent({ event: 'food_category_selected', source: 'food_discovery', context: 'coffee', query: 'private text' })?.context, 'coffee')
  assert.equal(parseHomeDiscoveryEvent({ event: 'nearby_search_started', source: 'hero', context: 'near_me' })?.placeId, null)
  assert.equal(parseHomeDiscoveryEvent({ event: 'nearby_search_started', source: 'hero', context: 'precise_coordinates' }), null)
  assert.equal(parseHomeDiscoveryEvent({ event: 'cafe_detail_opened', source: 'featured', context: '-1' }), null)
  assert.equal(parseHomeDiscoveryEvent({ event: 'unknown', source: 'featured', context: '1' }), null)
})
