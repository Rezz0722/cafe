import assert from 'node:assert/strict'
import test from 'node:test'
import { getDiscoveryPage, pagePath } from './pagination'

test('discovery pages clamp invalid, repeated, and out-of-range values', () => {
  for (const value of [undefined, '', '0', '-1', '2x', '1.5', ['2']]) {
    assert.equal(getDiscoveryPage(value, 31).page, 1)
  }
  assert.deepEqual(getDiscoveryPage('2', 31), { page: 2, total: 31, totalPages: 3, offset: 12, limit: 12 })
  assert.equal(getDiscoveryPage('999999999999999999999999999999999999999', 31).page, 3)
  assert.deepEqual(getDiscoveryPage('5', 0), { page: 1, total: 0, totalPages: 1, offset: 0, limit: 12 })
  assert.equal(getDiscoveryPage('1', 100, 1000).limit, 48)
  assert.equal(getDiscoveryPage('1', 100, Number.NaN).limit, 12)
})

test('page URLs preserve filters, omit page one, and encode anchors', () => {
  assert.equal(pagePath('/reviews', 1), '/reviews')
  assert.equal(pagePath('/reviews', 2), '/reviews?page=2')
  assert.equal(pagePath('/mashhad', 2, { sort: 'rating', district: 'a b' }, 'cafes'), '/mashhad?sort=rating&district=a+b&page=2#cafes')
  assert.equal(pagePath('/reviews', 1, { page: '5', sort: 'latest' }, '#reviews'), '/reviews?sort=latest#reviews')
})
