import assert from 'node:assert/strict'
import { test } from 'node:test'
import { matchIntents } from './matchIntent.ts'
import { normalizeFa, normalizePlaceName, finglishToFa } from '../text/normalize.ts'

// ── رگرسیون باگ اصلی ────────────────────────────────────────────────
// در نسخه‌ی قبلی «مناسب قرار» هر سه نیتِ «مناسب …» را روشن می‌کرد و چون فیلتر
// AND بود، صفر نتیجه می‌داد. این تست دقیقاً همان را می‌بندد.

test('«مناسب قرار» فقط good_for_date را روشن می‌کند', () => {
  const { attributeIds } = matchIntents('مناسب قرار')
  assert.deepEqual(attributeIds, ['good_for_date'])
})

test('«مناسب مطالعه» فقط good_for_study را روشن می‌کند', () => {
  const { attributeIds } = matchIntents('مناسب مطالعه')
  assert.deepEqual(attributeIds, ['good_for_study'])
})

test('«مناسب کار با لپ‌تاپ» فقط laptop_friendly را روشن می‌کند', () => {
  const { attributeIds } = matchIntents('مناسب کار با لپ‌تاپ')
  assert.deepEqual(attributeIds, ['laptop_friendly'])
})

test('«مناسب کار» (شکل کوتاه که صفحه‌ی اول لینک می‌دهد) هم کار می‌کند', () => {
  const { attributeIds } = matchIntents('مناسب کار')
  assert.deepEqual(attributeIds, ['laptop_friendly'])
})

// ── چند نیت هم‌زمان ─────────────────────────────────────────────────

test('دو نیت در یک جمله هر دو استخراج می‌شوند', () => {
  const { attributeIds } = matchIntents('جایی دنج برای قرار')
  assert.ok(attributeIds.includes('cozy'))
  assert.ok(attributeIds.includes('good_for_date'))
  assert.equal(attributeIds.length, 2)
})

test('جمله‌ی طبیعی کاربر — سه نیت', () => {
  const { attributeIds } = matchIntents('کافه آروم با پریز برای کار با لپ تاپ')
  assert.ok(attributeIds.includes('quiet'))
  assert.ok(attributeIds.includes('power_outlets'))
  assert.ok(attributeIds.includes('laptop_friendly'))
})

// ── مرز واژه ────────────────────────────────────────────────────────

test('«قرارداد» نباید نیتِ «قرار» را روشن کند', () => {
  const { attributeIds } = matchIntents('قرارداد')
  assert.deepEqual(attributeIds, [])
})

// ── متن آزادِ بدون نیت ──────────────────────────────────────────────

test('نام کافه به‌عنوان residual برمی‌گردد نه نیت', () => {
  const { attributeIds, residual } = matchIntents('کافه رف')
  assert.deepEqual(attributeIds, [])
  assert.ok(residual.includes('رف'))
})

test('نیت مصرف می‌شود و بقیه residual می‌ماند', () => {
  const { attributeIds, residual } = matchIntents('صبحانه در سجاد')
  assert.deepEqual(attributeIds, ['breakfast'])
  assert.ok(residual.includes('سجاد'))
  assert.ok(!residual.includes('صبحانه'))
})

// ── ورودی خالی ──────────────────────────────────────────────────────

test('ورودی خالی امن است', () => {
  assert.deepEqual(matchIntents('').attributeIds, [])
  assert.deepEqual(matchIntents('   ').attributeIds, [])
})

// ── نرمال‌سازی فارسی ────────────────────────────────────────────────

test('کاف و یای عربی با فارسی یکی می‌شوند', () => {
  assert.equal(normalizeFa('كافه'), normalizeFa('کافه'))
  assert.equal(normalizeFa('چاي'), normalizeFa('چای'))
})

test('نیم‌فاصله و فاصله یکی می‌شوند', () => {
  assert.equal(normalizeFa('کافه‌گرد'), normalizeFa('کافه گرد'))
})

test('ارقام فارسی به ASCII', () => {
  assert.equal(normalizeFa('۱۲۳'), '123')
  assert.equal(normalizeFa('٤٥٦'), '456')
})

test('نیت با املای عربی هم پیدا می‌شود', () => {
  // «مناسب كار» با کافِ عربی
  const { attributeIds } = matchIntents('مناسب كار')
  assert.deepEqual(attributeIds, ['laptop_friendly'])
})

test('normalizePlaceName واژه‌های عمومی را حذف می‌کند', () => {
  assert.equal(normalizePlaceName('کافه رُف'), normalizePlaceName('رف'))
  assert.equal(normalizePlaceName('رستوران بام سبز'), 'بام سبز')
})

test('normalizePlaceName روی نامِ صرفاً عمومی رشته‌ی خالی برنمی‌گرداند', () => {
  assert.equal(normalizePlaceName('کافه'), 'کافه')
})

// ── فینگلیش ─────────────────────────────────────────────────────────

test('ترانویسی فینگلیش چیزی تولید می‌کند', () => {
  assert.ok(finglishToFa('cafe').length > 0)
})
