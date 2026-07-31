import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  mapAmenities,
  mapArea,
  mapCategory,
  mapPriceRange,
  makeSlug,
  normalizePhone,
} from './mapping.ts'

// ── محله ────────────────────────────────────────────────────────────

test('نام محله‌ی ساده نگاشت می‌شود', () => {
  assert.equal(mapArea('سجاد'), 'sajad')
  assert.equal(mapArea('احمدآباد'), 'ahmadabad')
})

test('«کوه‌سنگی» با نیم‌فاصله همان کوهسنگی است', () => {
  assert.equal(mapArea('کوه‌سنگی'), 'kuhsangi')
  assert.equal(mapArea('کوهسنگی'), 'kuhsangi')
})

test('محله‌ی چندتایی — اولی برنده است', () => {
  assert.equal(mapArea('وکیل‌آباد / سجاد'), 'vakilabad')
})

test('محله‌ی ناشناخته null برمی‌گرداند، نه حدس', () => {
  assert.equal(mapArea('یک جای بی‌ربط'), null)
  assert.equal(mapArea(''), null)
})

// ── قیمت ────────────────────────────────────────────────────────────

test('بازه‌ی قیمت به سطح تبدیل می‌شود', () => {
  assert.equal(mapPriceRange('اقتصادی'), 1)
  assert.equal(mapPriceRange('متوسط'), 2)
  assert.equal(mapPriceRange('بالا'), 3)
})

/**
 * خطای محافظه‌کارانه به سمت گران‌تر: اگر کاربر «اقتصادی» فیلتر کند و جای
 * گران ببیند اعتمادش می‌ریزد؛ برعکسش فقط یعنی یک گزینه را ندیده.
 */
test('«متوسط تا بالا» گران حساب می‌شود نه متوسط', () => {
  assert.equal(mapPriceRange('متوسط تا بالا'), 3)
})

test('بازه‌ی ناشناخته به متوسط برمی‌گردد', () => {
  assert.equal(mapPriceRange('چیز عجیب'), 2)
})

// ── نوع ─────────────────────────────────────────────────────────────

test('دسته‌بندی به نوع مکان نگاشت می‌شود', () => {
  assert.equal(mapCategory('مینیمال / مدرن'), 'cafe')
  assert.equal(mapCategory('رستوران ایتالیایی'), 'restaurant')
  assert.equal(mapCategory('کافه', 'استیک ریب‌آی'), 'cafe_restaurant')
})

// ── امکانات ─────────────────────────────────────────────────────────

test('امکانات شناخته‌شده به شناسه نگاشت می‌شوند', () => {
  const { attributes } = mapAmenities(['مناسب کار با لپ‌تاپ', 'پارکینگ', 'وای‌فای'])
  assert.equal(attributes.get('laptop_friendly'), 2)
  assert.equal(attributes.get('parking'), 2)
  assert.equal(attributes.get('fast_wifi'), 2)
})

/**
 * مهم‌ترین رفتار این ماژول: رشته‌ی نگاشت‌نشده **دور ریخته نمی‌شود**.
 * «کرواسان تازه» برای کاربر ارزش دارد، فقط چیزی نیست که رویش فیلتر بگذاری.
 */
test('رشته‌ی نگاشت‌نشده به highlights می‌رود نه سطل زباله', () => {
  // «پاستا پستو» آیتم منوست، نه امکانات — نباید در واژگان فیلتر بیاید،
  // ولی باید برای کاربر نمایش داده شود.
  const { attributes, highlights } = mapAmenities(['پاستا پستو', 'پارکینگ'])
  assert.equal(attributes.get('parking'), 2)
  assert.ok(highlights.includes('پاستا پستو'))
  assert.ok(!attributes.has('پاستا پستو'))
})

test('«فضای باز محدود» درجه‌ی تاحدی می‌گیرد نه بله', () => {
  const { attributes } = mapAmenities(['فضای باز محدود'])
  assert.equal(attributes.get('outdoor'), 1)
})

test('وقتی یک ویژگی از دو رشته بیاید، بالاترین درجه برنده است', () => {
  const { attributes } = mapAmenities(['فضای باز محدود', 'تراس تابستانی'])
  assert.equal(attributes.get('outdoor'), 2)
})

test('لیست خالی امن است', () => {
  const { attributes, highlights } = mapAmenities([])
  assert.equal(attributes.size, 0)
  assert.equal(highlights.length, 0)
})

// ── تلفن ────────────────────────────────────────────────────────────

test('تلفن معتبر پذیرفته می‌شود', () => {
  assert.equal(normalizePhone('۰۵۱-۳۷۶۵۴۳۲۱'), '۰۵۱-۳۷۶۵۴۳۲۱')
})

/**
 * ۱۰ رکورد در فایل ورودی این شکلی‌اند. نمایش شماره‌ی غلط بدتر از نبودِ
 * شماره است: کاربر زنگ می‌زند به یک غریبه.
 */
test('تلفن با حرف فارسی رد می‌شود', () => {
  assert.equal(normalizePhone('۰۵۱-۳۷۶۰۱۰هم'), null)
})

test('تلفن خیلی کوتاه رد می‌شود', () => {
  assert.equal(normalizePhone('۰۵۱-۳۱۶۶۰'), null)
})

test('تلفن خالی null است، نه خطا', () => {
  assert.equal(normalizePhone(undefined), null)
  assert.equal(normalizePhone(''), null)
})

// ── slug ────────────────────────────────────────────────────────────

test('slug از نام انگلیسی ساخته می‌شود', () => {
  assert.equal(makeSlug('Vien Cafe', 'کافه وین', 1), 'vien-cafe')
})

test('بدون نام انگلیسی، از فارسی می‌سازد', () => {
  const slug = makeSlug('', 'کافه وین', 1)
  assert.ok(slug.length > 0)
  assert.ok(!slug.includes(' '))
})

test('بدون هیچ نامی، به شناسه برمی‌گردد', () => {
  assert.equal(makeSlug('', '', 42), 'cafe-42')
})
