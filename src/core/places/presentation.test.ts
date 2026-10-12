import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ageInDays,
  menuPriceTrust,
  placeIdentity,
  presentMenuSectionName,
  publicReviewerName,
} from './presentation.ts'

test('نام شعبه و غلط رایج Extera از عنوان دسته پاک می‌شود', () => {
  assert.equal(
    presentMenuSectionName('پیتزا / Pizza (شعبهٔ قاضی طباطبایی)', 'قاضی طباطبایی'),
    'پیتزا / Pizza',
  )
  assert.equal(presentMenuSectionName('اضافات / Extera', 'قاضی طباطبایی'), 'اضافات / Extras')
  assert.equal(
    presentMenuSectionName('نوشیدنی های گرم / Hot drinks', 'قاضی طباطبایی'),
    'نوشیدنی‌های گرم / Hot drinks',
  )
  assert.equal(
    presentMenuSectionName('شام و نهار (شعبه قاضی طباطبایی)/ food', 'قاضی طباطبایی'),
    'شام و ناهار / food',
  )
})

test('هویت برند و شعبه در دو سطح جدا ارائه می‌شود', () => {
  assert.deepEqual(
    placeIdentity({ name: 'کافه راموز — شعبه قاضی', brandName: 'کافه راموز', branchName: 'قاضی' }),
    { title: 'کافه راموز', branchLabel: 'شعبهٔ قاضی' },
  )
})

test('نام عمومی نظر‌دهنده، نام خانوادگی کامل را افشا نمی‌کند', () => {
  assert.equal(publicReviewerName('علیرضا ساقی'), 'علیرضا س.')
  assert.equal(publicReviewerName('ندا'), 'ندا')
  assert.equal(publicReviewerName(''), 'کاربر کو کافه')
})

test('سن داده منفی نمی‌شود', () => {
  const now = new Date('2026-09-14T12:00:00Z')
  assert.equal(ageInDays(new Date('2026-09-12T12:00:00Z'), now), 2)
  assert.equal(ageInDays(new Date('2026-09-15T12:00:00Z'), now), 0)
  assert.equal(ageInDays(null, now), null)
})

test('Sync تازه زمان تغییر یا تأیید قیمتِ نامعلوم را جعل نمی‌کند', () => {
  const now = new Date('2026-10-12T12:00:00Z')
  const unknown = menuPriceTrust({
    priceLastUpdatedAt: null, priceStatsItemCount: 2,
    priceStaleItemCount: 2, stalePriceDays: 120,
  }, now)
  assert.equal(unknown.latestRecordedChangeAt, null)
  assert.equal(unknown.isStale, true)

  const old = menuPriceTrust({
    priceLastUpdatedAt: new Date('2026-05-01T12:00:00Z'), priceStatsItemCount: 2,
    priceStaleItemCount: 1, stalePriceDays: 120,
  }, now)
  assert.equal(old.isStale, true)
  assert.equal(old.latestRecordedChangeAt?.toISOString(), '2026-05-01T12:00:00.000Z')
  assert.equal(menuPriceTrust({
    priceLastUpdatedAt: new Date('2026-10-10T12:00:00Z'), priceStatsItemCount: 0,
    priceStaleItemCount: 0, stalePriceDays: 120,
  }, now).isStale, false)
})
