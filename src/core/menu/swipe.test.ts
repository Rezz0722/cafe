import assert from 'node:assert/strict'
import test from 'node:test'
import { menuSectionStepFromSwipe } from './swipe.ts'

test('در RTL کشیدن به راست به دستهٔ بعدی می‌رود', () => {
  assert.equal(menuSectionStepFromSwipe(90, 8), 1)
})

test('در RTL کشیدن به چپ به دستهٔ قبلی می‌رود', () => {
  assert.equal(menuSectionStepFromSwipe(-90, 8), -1)
})

test('حرکت کوتاه تغییر دسته نمی‌دهد', () => {
  assert.equal(menuSectionStepFromSwipe(30, 2), 0)
})

test('اسکرول عمودی با ورق‌زدن اشتباه نمی‌شود', () => {
  assert.equal(menuSectionStepFromSwipe(70, 100), 0)
})
