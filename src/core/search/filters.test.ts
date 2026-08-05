import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildQuery,
  countActiveFilters,
  DEFAULT_FILTERS,
  describeFilters,
  hasActiveFilters,
  parseFilters,
  searchPath,
} from './filters'

test('parseFilters پارامترهای خالی را به پیش‌فرض می‌برد', () => {
  assert.deepEqual(parseFilters({}), DEFAULT_FILTERS)
})

test('parseFilters فهرست facet را از کاما جدا می‌کند', () => {
  const filters = parseFilters({ f: 'pasta,coffee' })
  assert.deepEqual(filters.facets, ['pasta', 'coffee'])
})

test('parseFilters رده‌ی قیمت نامعتبر را دور می‌ریزد', () => {
  // ورودی از URL است، پس هر چیزی ممکن است بیاید.
  assert.deepEqual(parseFilters({ tier: '1,9,abc,3' }).tiers, [1, 3])
})

test('parseFilters رده‌ی تکراری را یکی می‌کند', () => {
  assert.deepEqual(parseFilters({ tier: '2,2,2' }).tiers, [2])
})

test('parseFilters «نزدیک من» را به مرتب‌سازی فاصله می‌برد', () => {
  // «نزدیک من» بدون مرتب‌سازی فاصله بی‌معنی است.
  assert.equal(parseFilters({ near: '1' }).sort, 'distance')
  // مگر کاربر صریحاً چیز دیگری خواسته باشد.
  assert.equal(parseFilters({ near: '1', sort: 'price_asc' }).sort, 'price_asc')
})

test('parseFilters مرتب‌سازی ناشناس را به پیش‌فرض برمی‌گرداند', () => {
  assert.equal(parseFilters({ sort: 'drop table' }).sort, 'rating')
})

test('parseFilters صفحه‌ی نامعتبر را ۱ می‌کند و سقف دارد', () => {
  assert.equal(parseFilters({ page: '0' }).page, 1)
  assert.equal(parseFilters({ page: '-3' }).page, 1)
  assert.equal(parseFilters({ page: 'x' }).page, 1)
  assert.equal(parseFilters({ page: '9999' }).page, 50)
})

test('parseFilters سقف قیمت را عدد می‌کند', () => {
  assert.equal(parseFilters({ max: '300000' }).maxPrice, 300_000)
  assert.equal(parseFilters({ max: '-1' }).maxPrice, null)
  assert.equal(parseFilters({ max: 'abc' }).maxPrice, null)
})

test('parseFilters طول جست‌وجو را محدود می‌کند', () => {
  assert.equal(parseFilters({ q: 'x'.repeat(200) }).q.length, 80)
})

test('parseFilters تعداد facet را محدود می‌کند', () => {
  // ۲۰ facet یعنی صفر نتیجه و یک پرس‌وجوی بی‌فایده‌ی سنگین.
  assert.equal(parseFilters({ f: Array.from({ length: 20 }, (_, i) => `f${i}`).join(',') }).facets.length, 6)
})

test('buildQuery پارامترهای پیش‌فرض را حذف می‌کند', () => {
  // دو URL متفاوت نباید یک نتیجه بدهند — مسئله‌ی محتوای تکراری.
  assert.equal(buildQuery({}), '')
  assert.equal(buildQuery({ sort: 'rating' }), '')
  assert.equal(buildQuery({ page: 1 }), '')
  assert.equal(buildQuery({ view: 'list' }), '')
})

test('buildQuery و parseFilters معکوس هم‌اند', () => {
  const filters = {
    ...DEFAULT_FILTERS,
    q: 'لاته',
    facets: ['coffee', 'pasta'],
    dish: 'alfredo-pasta',
    districtId: 'sajad',
    tiers: [1, 2],
    maxPrice: 300_000,
    openNow: true,
    nearMe: true,
    sort: 'distance' as const,
    view: 'map' as const,
    page: 3,
  }
  const query = buildQuery(filters)
  const params = Object.fromEntries(new URLSearchParams(query.slice(1)))
  assert.deepEqual(parseFilters(params), filters)
})

test('buildQuery وقتی «نزدیک من» روشن است sort اضافی نمی‌گذارد', () => {
  const query = buildQuery({ nearMe: true, sort: 'distance' })
  assert.equal(query, '?near=1')
})

test('searchPath مسیر کامل می‌سازد', () => {
  assert.equal(searchPath({}), '/search')
  assert.equal(searchPath({ dish: 'latte' }), '/search?dish=latte')
})

test('hasActiveFilters فیلتر خالی را false می‌دهد', () => {
  assert.equal(hasActiveFilters(DEFAULT_FILTERS), false)
  assert.equal(hasActiveFilters({ ...DEFAULT_FILTERS, openNow: true }), true)
  assert.equal(hasActiveFilters({ ...DEFAULT_FILTERS, q: '  ' }), false, 'فاصله فیلتر نیست')
})

test('countActiveFilters هر فیلتر را می‌شمارد', () => {
  assert.equal(
    countActiveFilters({
      ...DEFAULT_FILTERS,
      facets: ['a', 'b'],
      tiers: [1],
      openNow: true,
    }),
    4,
  )
})

test('describeFilters عنوان قابل خواندن می‌سازد', () => {
  assert.equal(describeFilters(DEFAULT_FILTERS), 'کافه‌های مشهد')

  assert.equal(
    describeFilters(
      { ...DEFAULT_FILTERS, dish: 'alfredo-pasta', nearMe: true },
      { dishLabel: () => 'پاستا آلفردو' },
    ),
    'بهترین پاستا آلفردو نزدیک من',
  )

  assert.equal(
    describeFilters(
      { ...DEFAULT_FILTERS, facets: ['pasta'], districtId: 'sajad' },
      { facetLabel: () => 'پاستا', districtLabel: () => 'سجاد' },
    ),
    'کافه‌های پاستا در سجاد',
  )
})
