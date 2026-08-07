/**
 * تست پیش‌پردازش کوئری.
 *
 * محله‌ها همان محله‌های واقعیِ داده‌اند (۲۹ ردیف در جدول `district`)، چون
 * ریسکِ تطابق تصادفی به خودِ این نام‌ها بستگی دارد: «ارگ» سه نویسه است و اگر
 * تطابق مرزِ واژه نداشته باشد، وسط واژه‌های دیگر پیدا می‌شود.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseSearchQuery, type DistrictOption } from './parseQuery'

const DISTRICTS: DistrictOption[] = [
  { id: 'd-ahmadabad', slug: 'ahmadabad', name: 'احمدآباد' },
  { id: 'd-arg', slug: 'arg', name: 'ارگ' },
  { id: 'd-emam-reza', slug: 'emam-reza', name: 'امام رضا' },
  { id: 'd-emamat', slug: 'emamat', name: 'امامت' },
  { id: 'd-sajad', slug: 'sajad', name: 'سجاد' },
  { id: 'd-torghabeh', slug: 'torghabeh', name: 'طرقبه' },
  { id: 'd-ghasemabad', slug: 'ghasemabad', name: 'قاسم‌آباد' },
  { id: 'd-kowsar', slug: 'kowsar', name: 'کوثر' },
  { id: 'd-kuhsangi', slug: 'kuhsangi', name: 'کوه‌سنگی' },
  { id: 'd-azadi', slug: 'azadi', name: 'میدان آزادی' },
  { id: 'd-hashemieh', slug: 'hashemieh', name: 'هاشمیه' },
  { id: 'd-haft-tir', slug: 'haft-tir', name: 'هفت تیر' },
  { id: 'd-vakilabad', slug: 'vakilabad', name: 'وکیل‌آباد' },
  { id: 'd-daneshgah', slug: 'daneshgah', name: 'دانشگاه' },
  { id: 'd-daneshjou', slug: 'daneshjou', name: 'دانشجو' },
]

const parse = (query: string) => parseSearchQuery(query, DISTRICTS)

// ── همان کوئری‌ای که باگ را ساخت

test('«کافه‌ای در احمد آباد» منطقه را تشخیص می‌دهد و متن را خالی می‌کند', () => {
  const result = parse('کافه‌ای در احمد آباد')
  assert.equal(result.districtId, 'd-ahmadabad')
  assert.equal(result.district?.name, 'احمدآباد')
  assert.equal(result.text, '', 'چیزی برای جست‌وجوی نام نمی‌ماند')
})

test('نیم‌فاصله و فاصله یکسان‌سازی می‌شوند', () => {
  for (const form of ['احمدآباد', 'احمد آباد', 'احمد‌آباد', 'احمدَآباد']) {
    assert.equal(parse(form).districtId, 'd-ahmadabad', form)
  }
})

test('«قاسم آباد» و «قاسم‌آباد» یکی‌اند', () => {
  assert.equal(parse('قاسم آباد').districtId, 'd-ghasemabad')
  assert.equal(parse('قاسم‌آباد').districtId, 'd-ghasemabad')
})

test('«کوه سنگی» و «کوه‌سنگی» یکی‌اند', () => {
  assert.equal(parse('کوه سنگی').districtId, 'd-kuhsangi')
  assert.equal(parse('کوه‌سنگی').districtId, 'd-kuhsangi')
})

// ── کلمات توقف

test('«کافه» تنها، هیچ فیلتری نمی‌سازد', () => {
  const result = parse('کافه')
  assert.equal(result.districtId, null)
  assert.equal(result.text, '', 'نه اینکه روی «کافه» جست‌وجو کند')
})

test('واژه‌های نیت حذف می‌شوند', () => {
  const result = parse('یه کافه خوب نزدیک وکیل آباد میخوام')
  assert.equal(result.districtId, 'd-vakilabad')
  // «خوب» در فهرست توقف نیست ولی تنها چیزی است که می‌ماند.
  assert.equal(result.text, 'خوب')
})

test('«توی» و «نزدیک» حذف می‌شوند', () => {
  assert.equal(parse('کافه توی سجاد').districtId, 'd-sajad')
  assert.equal(parse('کافه نزدیک سجاد').districtId, 'd-sajad')
  assert.equal(parse('کافه توی سجاد').text, '')
})

test('واژه‌های ژنریکِ نشانی حذف می‌شوند', () => {
  const result = parse('کافه‌های بلوار سجاد')
  assert.equal(result.districtId, 'd-sajad')
  assert.equal(result.text, '', '«بلوار» نباید به جست‌وجوی نام برود')
})

// ── نام چندواژه‌ای: پنجره‌ی بلندتر برنده است

test('«میدان آزادی» کامل گرفته می‌شود، نه فقط «میدان»', () => {
  const result = parse('کافه در میدان آزادی')
  assert.equal(result.districtId, 'd-azadi')
  assert.equal(result.text, '')
})

test('«هفت تیر» و «امام رضا» به‌عنوان یک نام گرفته می‌شوند', () => {
  assert.equal(parse('کافه هفت تیر').districtId, 'd-haft-tir')
  assert.equal(parse('کافه‌ای نزدیک امام رضا').districtId, 'd-emam-reza')
})

test('نام مستعار شناخته می‌شود', () => {
  assert.equal(parse('کافه فرامرز').districtId, null, 'فرامرز عباسی در این فیکسچر نیست')
  assert.equal(parse('طرقبه شاندیز').districtId, 'd-torghabeh')
  assert.equal(parse('کافه ۷ تیر').districtId, 'd-haft-tir')
})

// ── تطابق تصادفی نباید رخ بدهد

test('نام کوتاه منطقه وسط واژه‌ی دیگر پیدا نمی‌شود', () => {
  // «ارگ» داخل «بزرگ» و «سوارگاه» نباید تطابق بدهد.
  assert.equal(parse('کافه بزرگ').districtId, null)
  assert.equal(parse('کافه بزرگ').text, 'بزرگ')
  assert.equal(parse('سوارگاه').districtId, null)
})

test('«امامت» با «امام رضا» قاتی نمی‌شود', () => {
  assert.equal(parse('کافه امامت').districtId, 'd-emamat')
  assert.equal(parse('کافه امام رضا').districtId, 'd-emam-reza')
})

test('«دانشجو» با «دانشگاه» قاتی نمی‌شود', () => {
  assert.equal(parse('کافه دانشجو').districtId, 'd-daneshjou')
  assert.equal(parse('کافه دانشگاه').districtId, 'd-daneshgah')
})

// ── متنِ باقی‌مانده

test('نام کافه بعد از منطقه حفظ می‌شود', () => {
  const result = parse('کافه رُف در وکیل آباد')
  assert.equal(result.districtId, 'd-vakilabad')
  assert.equal(result.text, 'رف', 'نامِ کافه می‌ماند تا روی آن جست‌وجو شود')
})

test('بدون منطقه، نام کافه دست‌نخورده می‌ماند', () => {
  const result = parse('لمیز')
  assert.equal(result.districtId, null)
  assert.equal(result.text, 'لمیز')
  assert.equal(result.changed, false)
})

test('واژه‌ی یک‌نویسه‌ای حذف می‌شود', () => {
  // `MATCH … AGAINST` روی «ی» چیزی نمی‌دهد و فقط نتیجه را صفر می‌کند.
  assert.equal(parse('کافه ی سجاد').districtId, 'd-sajad')
  assert.equal(parse('کافه ی سجاد').text, '')
})

test('کوئری خالی امن است', () => {
  for (const value of ['', '   ', '!!!']) {
    const result = parseSearchQuery(value, DISTRICTS)
    assert.equal(result.districtId, null, JSON.stringify(value))
    assert.equal(result.text, '')
    assert.equal(result.changed, false)
  }
})

test('فهرست خالیِ محله، خطا نمی‌دهد', () => {
  const result = parseSearchQuery('کافه در احمد آباد', [])
  assert.equal(result.districtId, null)
  assert.equal(result.text, 'احمد اباد')
})

// ── `changed` برای شفافیت در UI

test('changed وقتی چیزی حذف شده، درست است', () => {
  assert.equal(parse('کافه در سجاد').changed, true)
  assert.equal(parse('لمیز').changed, false)
})
