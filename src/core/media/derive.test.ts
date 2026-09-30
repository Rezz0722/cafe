import test from 'node:test'
import assert from 'node:assert/strict'
import { sourceDimensionsAllowed } from './derive'

test('تصویر عادی موبایل پذیرفته می‌شود', () => {
  assert.equal(sourceDimensionsAllowed(4032, 3024), true)
})

test('بمب پیکسلی و ضلع غیرعادی پیش از تبدیل رد می‌شوند', () => {
  assert.equal(sourceDimensionsAllowed(12_001, 100), false)
  assert.equal(sourceDimensionsAllowed(10_000, 10_000), false)
  assert.equal(sourceDimensionsAllowed(0, 100), false)
})
