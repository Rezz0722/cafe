import assert from 'node:assert/strict'
import test from 'node:test'
import { pricesForPlaceStats } from './stats'

test('آیتم حذف‌شده و قیمت بالاتر از سقف وارد آمار مکان نمی‌شوند', () => {
  assert.deepEqual(
    pricesForPlaceStats(
      [
        { price: 180_000, manuallyExcluded: false, facetKind: 'drink' },
        { price: 20_000_000, manuallyExcluded: false, facetKind: 'menu' },
        { price: 240_000, manuallyExcluded: true, facetKind: 'menu' },
        { price: null, manuallyExcluded: false, facetKind: 'menu' },
      ],
      { maxItemPrice: 5_000_000, excludeServiceSections: false },
    ),
    [180_000],
  )
})

test('سقف صفر غیرفعال است و حذف دستهٔ خدماتی قابل تنظیم است', () => {
  const rows = [
    { price: 20_000_000, manuallyExcluded: false, facetKind: 'menu' },
    { price: 300_000, manuallyExcluded: false, facetKind: 'service' },
  ]
  assert.deepEqual(pricesForPlaceStats(rows, { maxItemPrice: 0, excludeServiceSections: true }), [20_000_000])
  assert.deepEqual(pricesForPlaceStats(rows, { maxItemPrice: 0, excludeServiceSections: false }), [20_000_000, 300_000])
})
