import { test } from 'node:test'
import assert from 'node:assert/strict'
import { menuReadiness } from './menuReadiness'

type Input = Parameters<typeof menuReadiness>[0]
function fixture(): Input {
  return { name: 'کافه', address: 'مشهد', phones: ['09123456789'], status: 'published', logoUrl: '/logo.webp', photos: [], hours: [{ dow: 0, shiftIndex: 0, opensAt: '08:00', closesAt: '23:00', closed: false }], sections: [{ id: 1, name: 'قهوه', facetId: null, imageUrl: null, imageFullUrl: null, branchScope: 'branch', items: [{ id: 1, publicId: 'test', name: 'قهوه', description: null, price: 100000, priceUnknown: false, excludeFromPriceStats: false, available: true, featured: false, archivedAt: null, imageUrl: null, priceUpdatedAt: null, variants: [] }] }] }
}
test('complete steps are advisory and do not mutate the place', () => {
  const data = fixture(), before = structuredClone(data), result = menuReadiness(data)
  assert.equal(result.completed, 6); assert.equal(result.next, null)
  assert.deepEqual(data, before)
})
test('empty menu has no false positive for items or prices', () => {
  const data = fixture(); data.sections = []
  const result = menuReadiness(data)
  assert.equal(result.completed, 3); assert.equal(result.next?.id, 'categories')
})
test('other branches and quarantined sections cannot satisfy setup', () => {
  for (const scope of ['other_branch', 'unverified'] as const) {
    const data = fixture(); data.sections[0]!.branchScope = scope
    assert.equal(menuReadiness(data).completed, 3)
  }
  const shared = fixture(); shared.sections[0]!.branchScope = 'shared'
  assert.equal(menuReadiness(shared).completed, 6)
})
test('archived and unavailable items do not satisfy the available-item step', () => {
  const data = fixture(); data.sections[0]!.items[0]!.archivedAt = new Date()
  assert.equal(menuReadiness(data).next?.id, 'items')
  data.sections[0]!.items[0]!.archivedAt = null; data.sections[0]!.items[0]!.available = false
  assert.equal(menuReadiness(data).next?.id, 'items')
})
test('unknown and invalid numeric prices require review; zero is valid', () => {
  const data = fixture()
  for (const price of [null, NaN, Infinity, -1]) {
    data.sections[0]!.items[0]!.price = price
    assert.equal(menuReadiness(data).next?.id, 'prices')
  }
  data.sections[0]!.items[0]!.price = 0
  assert.equal(menuReadiness(data).next, null)
})
test('available variants with missing prices require review; unavailable variants do not', () => {
  const data = fixture()
  data.sections[0]!.items[0]!.variants = [{ id: 3, label: 'بزرگ', price: null, available: true, sortOrder: 0, priceUpdatedAt: null }]
  assert.equal(menuReadiness(data).next?.id, 'prices')
  data.sections[0]!.items[0]!.variants[0]!.available = false
  assert.equal(menuReadiness(data).next, null)
})
test('closed or incomplete hours are not a completed setup step', () => {
  const data = fixture(); data.hours[0]!.closed = true
  assert.equal(menuReadiness(data).next?.id, 'hours')
  data.hours[0]!.closed = false; data.hours[0]!.closesAt = null
  assert.equal(menuReadiness(data).next?.id, 'hours')
})
test('publication follows the existing QR policy regardless of completed steps', () => {
  const data = fixture()
  for (const status of ['draft', 'permanently_closed', 'unknown']) {
    data.status = status; assert.equal(menuReadiness(data).publicDestination, false)
    assert.equal(menuReadiness(data).completed, 6)
  }
  data.status = 'temporarily_closed'
  assert.equal(menuReadiness(data).publicDestination, true)
  assert.equal(menuReadiness(data).temporarilyClosed, true)
})
test('whitespace identity and empty phone do not satisfy setup', () => {
  const data = fixture(); data.phones = ['  ']
  assert.equal(menuReadiness(data).next?.id, 'identity')
})
