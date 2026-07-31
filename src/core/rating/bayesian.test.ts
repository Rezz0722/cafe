import assert from 'node:assert/strict'
import { test } from 'node:test'
import { bayesianAverage, rawAverage, computeSiteMean } from './bayesian.ts'

test('میانگین خام همان تقسیم ساده است', () => {
  assert.equal(rawAverage(45, 10), 4.5)
  assert.equal(rawAverage(0, 0), 0, 'تقسیم بر صفر امن است')
})

/**
 * دلیل وجود کل این ماژول: با میانگین خام، ۴٫۹ از ۳ نظر بالای ۴٫۶ از ۵۰۰ نظر
 * می‌نشیند — که برای کاربر انتخاب بدتری است.
 */
test('کافه‌ی پرنظر با امتیاز کمی پایین‌تر، بالاتر رتبه می‌گیرد', () => {
  const fewReviews = bayesianAverage(4.9 * 3, 3) //   ۴٫۹ از ۳ نظر
  const manyReviews = bayesianAverage(4.6 * 500, 500) // ۴٫۶ از ۵۰۰ نظر

  assert.ok(
    manyReviews > fewReviews,
    `انتظار: ۴٫۶ از ۵۰۰ نظر (${manyReviews.toFixed(2)}) بالاتر از ۴٫۹ از ۳ نظر (${fewReviews.toFixed(2)})`,
  )
})

test('با تعداد نظر زیاد، به میانگین خام نزدیک می‌شود', () => {
  const score = bayesianAverage(4.6 * 5000, 5000)
  assert.ok(Math.abs(score - 4.6) < 0.01)
})

test('بدون نظر، میانگین سایت برمی‌گردد', () => {
  assert.equal(bayesianAverage(0, 0, 4.2), 4.2)
})

test('میانگین سایت از مجموع کل حساب می‌شود، نه میانگینِ میانگین‌ها', () => {
  const mean = computeSiteMean([
    { ratingSum: 50, ratingCount: 10 }, // ۵٫۰
    { ratingSum: 30, ratingCount: 10 }, // ۳٫۰
  ])
  assert.equal(mean, 4)
})

test('مجموعه‌ی خالی به پیش‌فرض برمی‌گردد', () => {
  assert.equal(computeSiteMean([]), 4.2)
})
