import assert from 'node:assert/strict'
import { test } from 'node:test'
import { directDistanceKm, pageSlice, sortCardsByDistance, sortItemsByDistance } from './clientSort'
import type { SortKey } from './filters'

const origin = { lat: 36.3, lng: 59.6 }

function fixtures() {
  const cards = [
    { id: 9, coords: { lat: 36.31, lng: 59.6 }, distanceKm: 123 },
    { id: 7, coords: null, distanceKm: 456 },
    { id: 2, coords: { ...origin }, distanceKm: 789 },
    { id: 1, coords: { ...origin }, distanceKm: null },
    { id: 3, coords: null, distanceKm: 111 },
  ]
  const items = cards.map((card, index) => ({
    id: card.id,
    distanceKm: 999,
    place: { ...card, id: 100 - index },
  }))
  const before = JSON.parse(JSON.stringify({ cards, items }))
  for (const card of cards) {
    if (card.coords) Object.freeze(card.coords)
    Object.freeze(card)
  }
  for (const item of items) {
    Object.freeze(item.place)
    Object.freeze(item)
  }
  Object.freeze(cards)
  Object.freeze(items)
  return { cards, items, before }
}

test('فاصلهٔ یک نقطه تا خودش صفر است', () => {
  assert.equal(directDistanceKm(origin, origin), 0)
})

for (const sort of ['rating', 'name', 'price_asc', 'price_desc', 'quality'] satisfies SortKey[]) {
  test(`موقعیت ذخیره‌شده ترتیب سرور کافه‌ها و آیتم‌ها را برای ${sort} تغییر نمی‌دهد`, () => {
    const { cards, items, before } = fixtures()
    const resultCards = sortCardsByDistance(cards, origin, sort)
    const resultItems = sortItemsByDistance(items, origin, sort)
    for (const result of [resultCards, resultItems]) {
      assert.deepEqual(result.map((entry) => entry.id), [9, 7, 2, 1, 3])
      assert.deepEqual(result.map((entry) => entry.distanceKm), [
        directDistanceKm(origin, { lat: 36.31, lng: 59.6 }), null, 0, 0, null,
      ])
      assert.deepEqual(pageSlice(result.map((entry) => entry.id), 2, 2), [2, 1])
    }
    assert.notStrictEqual(resultCards, cards)
    assert.notStrictEqual(resultItems, items)
    resultCards.forEach((card, index) => assert.notStrictEqual(card, cards[index]))
    resultItems.forEach((item, index) => assert.notStrictEqual(item, items[index]))
    assert.deepEqual({ cards, items }, before)
  })
}

for (const sort of [undefined, 'distance'] as const) {
  test(`مرتب‌سازی فاصلهٔ ${sort ?? 'پیش‌فرض'} برای هر دو نوع پایدار است و ورودی را تغییر نمی‌دهد`, () => {
    const { cards, items, before } = fixtures()
    const resultCards = sortCardsByDistance(cards, origin, sort)
    const resultItems = sortItemsByDistance(items, origin, sort)
    for (const result of [resultCards, resultItems]) {
      assert.deepEqual(result.map((entry) => entry.id), [1, 2, 9, 3, 7])
      assert.deepEqual(result.map((entry) => entry.distanceKm), [
        0, 0, directDistanceKm(origin, { lat: 36.31, lng: 59.6 }), null, null,
      ])
      assert.deepEqual(pageSlice(result.map((entry) => entry.id), 2, 2), [9, 3])
    }
    assert.notStrictEqual(resultCards, cards)
    assert.notStrictEqual(resultItems, items)
    resultCards.forEach((card) => assert.notStrictEqual(card, cards.find((entry) => entry.id === card.id)))
    resultItems.forEach((item) => assert.notStrictEqual(item, items.find((entry) => entry.id === item.id)))
    assert.deepEqual({ cards, items }, before)
  })
}

test('مرتب‌سازی فاصله روی کل نامزدها پایدار است و مختصات نامعلوم آخر می‌رود', () => {
  const cards = [
    { id: 9, coords: { lat: 36.31, lng: 59.6 } },
    { id: 3, coords: null },
    { id: 2, coords: { lat: 36.3, lng: 59.6 } },
    { id: 1, coords: { lat: 36.3, lng: 59.6 } },
  ]
  assert.deepEqual(
    sortCardsByDistance(cards, origin).map((card) => card.id),
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
    sortItemsByDistance(items, origin).map((item) => item.id),
    [2, 8, 4],
  )
})
