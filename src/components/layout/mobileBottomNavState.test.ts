import assert from 'node:assert/strict'
import test from 'node:test'
import { mobileBottomNavHref } from './mobileBottomNavState'

test('map and discovery have distinct current navigation states', () => {
  assert.equal(mobileBottomNavHref('/search', 'map'), '/search?view=map')
  assert.equal(mobileBottomNavHref('/search', null), '/search')
  assert.equal(mobileBottomNavHref('/search', 'list'), '/search')
  assert.equal(mobileBottomNavHref('/search', 'invalid'), '/search')
  assert.equal(mobileBottomNavHref('/', 'map'), '/')
  assert.equal(mobileBottomNavHref('/profile/reviews', null), '/profile')
  assert.equal(mobileBottomNavHref('/reviews', null), null)
})
