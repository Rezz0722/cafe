import assert from 'node:assert/strict'
import { test } from 'node:test'
import { directDistanceKm, pageSlice, sortCardsByDistance, sortItemsByDistance } from './clientSort'

test('فاصلهٔ یک نقطه تا خودش صفر است', () => {
  assert.equal(directDistanceKm({ lat: 36.3, lng: 59.6 }, { lat: 36.3, lng: 59.6 }), 0)
})

test('مرتب‌سازی فاصله روی کل نامزدها پایدار است و مختصات نامعلوم آخر می‌رود', () => {
  const cards = [
    { id: 9, coords: { lat: 36.31, lng: 59.6 } },
    { id: 3, coords: null },
    { id: 2, coords: { lat: 36.3, lng: 59.6 } },
    { id: 1, coords: { lat: 36.3, lng: 59.6 } },
  ]
  assert.deepEqual(
    sortCardsByDistance(cards, { lat: 36.3, lng: 59.6 }).map((card) => card.id),
    [1, 2, 9, 3],
  )
})

test('صفحه‌بندی بعد از مرتب‌سازی قابل پیش‌بینی است', () => {
  assert.deepEqual(pageSlice([1, 2, 3, 4, 5], 2, 2), [3, 4])
})

test('آیتم منو با مختصات کافهٔ خودش نزدیک‌ترین مرتب می‌شود', () => {
  const items = [
    { id: 8, place: { id: 8, coords: { lat: 36.4, lng: 59.6 } } },
    { id: 2, place: { id: 2, coords: { lat: 36.3, lng: 59.6 } } },
    { id: 4, place: { id: 4, coords: null } },
  ]
  assert.deepEqual(
    sortItemsByDistance(items, { lat: 36.3, lng: 59.6 }).map((item) => item.id),
    [2, 8, 4],
  )
})
