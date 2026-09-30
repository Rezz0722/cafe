import assert from 'node:assert/strict'
import { test } from 'node:test'
import { closestFuzzy, editDistance, fuzzyMatches } from './fuzzy'

test('فاصلهٔ ویرایشی درج، حذف و جایگزینی را می‌شمارد', () => {
  assert.equal(editDistance('پاستا', 'پاستاا'), 1)
  assert.equal(editDistance('لاته', 'لانه'), 1)
})

test('غلط کوتاه با یک برندهٔ روشن اصلاح می‌شود', () => {
  assert.equal(
    closestFuzzy('پاستاا', [
      { value: 'pasta', terms: ['پاستا'] },
      { value: 'pizza', terms: ['پیتزا'] },
    ]),
    'pasta',
  )
})

test('عبارت کوتاه، دور یا مبهم حدس زده نمی‌شود', () => {
  assert.equal(closestFuzzy('چای', [{ value: 'tea', terms: ['چای'] }]), null)
  assert.equal(closestFuzzy('نامرتبط', [{ value: 'pasta', terms: ['پاستا'] }]), null)
  assert.equal(closestFuzzy('لانه', [
    { value: 'latte', terms: ['لاته'] },
    { value: 'lane', terms: ['لانه'] },
  ]), 'lane')
})

test('چند شعبه با نام نزدیک، همگی قابل بازیابی‌اند', () => {
  const matches = fuzzyMatches('راموذ', [
    { value: 1, terms: ['راموز'] },
    { value: 2, terms: ['راموز'] },
    { value: 3, terms: ['پاپیلون'] },
  ])
  assert.deepEqual(matches.map((match) => match.value), [1, 2])
})
