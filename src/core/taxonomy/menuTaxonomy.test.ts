/**
 * تست واژگان منو.
 *
 * ورودی همه‌ی تست‌ها **نام واقعی** از فایل منبع است. تست‌های «نباید»
 * مهم‌ترند: آن‌ها همان اشتباهاتی را می‌بندند که فیلتر را بی‌اعتبار می‌کنند.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FACETS, DISHES, matchDish, matchFacet } from './menuTaxonomy'

// ═══ سلامت خودِ واژگان ═══

test('شناسه‌ی facetها یکتاست', () => {
  const ids = FACETS.map((f) => f.id)
  assert.equal(new Set(ids).size, ids.length)
})

test('slug دیش‌ها یکتاست', () => {
  const slugs = DISHES.map((d) => d.slug)
  assert.equal(new Set(slugs).size, slugs.length)
})

test('هر دیش به facet موجود اشاره می‌کند', () => {
  const facetIds = new Set(FACETS.map((f) => f.id))
  for (const dish of DISHES) {
    assert.ok(facetIds.has(dish.facetId), `دیش ${dish.slug} به facet ناموجود ${dish.facetId}`)
  }
})

test('هر دیش حداقل یک alias دارد', () => {
  for (const dish of DISHES) {
    assert.ok(dish.aliases.length > 0, `دیش ${dish.slug} بدون alias`)
  }
})

// ═══ تطبیق facet: املاهای مختلف یک مفهوم ═══

test('matchFacet پنج املای پاستا را یکی می‌کند', () => {
  // همه‌ی این‌ها در فایل منبع وجود دارند.
  for (const name of ['پاستا', 'پاستا / Pasta', 'پاستا/pastas', 'پاستا و لازانیا', 'Pasta']) {
    assert.equal(matchFacet(name), 'pasta', name)
  }
})

test('matchFacet املاهای نوشیدنی قهوه‌ای را درست تفکیک می‌کند', () => {
  assert.equal(matchFacet('نوشیدنی های گرم بر پایه قهوه / Coffee-based hot drinks'), 'coffee')
  assert.equal(matchFacet('نوشیدنی های سرد بر پایه قهوه'), 'cold_coffee')
  assert.equal(matchFacet('قهوه دمی / Brewed Coffee'), 'brewed_coffee')
})

test('matchFacet «بدون قهوه» را قهوه نمی‌داند', () => {
  // ۱۳ دسته با این نام در داده هست. اگر قهوه شمرده شوند، فیلتر «قهوه»
  // کافه‌هایی را نشان می‌دهد که قهوه ندارند.
  assert.equal(matchFacet('نوشیدنی گرم بدون قهوه / Hot drink without coffee'), 'hot_drinks')
  assert.equal(matchFacet('نوشیدنی های گرم بدون قهوه'), 'hot_drinks')
  assert.equal(matchFacet('نوشیدنی بدون کافئین'), 'hot_drinks')
})

test('matchFacet «سرویس قلیان» را قلیان می‌داند نه سرویس', () => {
  assert.equal(matchFacet('سرویس قلیان'), 'hookah')
  assert.equal(matchFacet('قلیان و سرویس'), 'hookah')
  assert.equal(matchFacet('قلیون'), 'hookah')
})

test('matchFacet ماچا را از چای جدا می‌کند', () => {
  // ماچا فنی چای است ولی کاربر جدا می‌جویدش — ۲۳ دسته «ماچا بار» دارند.
  assert.equal(matchFacet('ماچا بار'), 'matcha')
  assert.equal(matchFacet('چای و دمنوش / Tea & Herbal'), 'tea')
})

test('matchFacet دسته‌های رژیمی را می‌شناسد', () => {
  assert.equal(matchFacet('رژیمی'), 'healthy')
  assert.equal(matchFacet('Healthy / سالم'), 'healthy')
  assert.equal(matchFacet('ویژه گیاهخواران'), 'healthy')
  assert.equal(matchFacet('فیتنس بار / fitness'), 'healthy')
})

test('matchFacet دسته‌های پرتکرار منبع را پوشش می‌دهد', () => {
  const expected: [string, string][] = [
    ['پیش غذا', 'appetizer'],
    ['پیش غذا / Appetizer', 'appetizer'],
    ['صبحانه / Breakfast', 'breakfast'],
    ['برگر / Burger', 'burger'],
    ['پیتزا / Pizza', 'pizza'],
    ['استیک / Steak', 'steak'],
    ['سالاد / Salad', 'salad'],
    ['ماکتیل / Mocktail', 'mocktail'],
    ['شیک / Shake', 'shake'],
    ['اسموتی / Smoothie', 'smoothie'],
    ['کیک و دسر / Cake & Dessert', 'cake_dessert'],
    ['بیکری / Bakery', 'bakery'],
    ['ساندویچ / Sandwich', 'sandwich'],
    ['سوخاری / Fried', 'fried'],
    ['غذای ایرانی', 'persian_food'],
    ['آبمیوه طبیعی', 'juice'],
    ['بستنی', 'ice_cream'],
    ['افزودنی ها', 'addons'],
    ['سرویس پذیرایی', 'service'],
  ]
  for (const [name, facetId] of expected) {
    assert.equal(matchFacet(name), facetId, name)
  }
})

test('matchFacet نام بی‌ربط را null می‌دهد نه «سایر»', () => {
  // نگاشت‌نشده باید در گزارش بیاید تا واژگان بهتر شود — نه اینکه بی‌صدا
  // در سطل «سایر» گم شود.
  assert.equal(matchFacet('آفرینش'), null)
  assert.equal(matchFacet(''), null)
})

// ═══ تطبیق دیش ═══

test('matchDish بلندترین alias را برمی‌گزیند', () => {
  // ۳۴ آیتم «آیس لاته نارگیل» در داده هست. اگر به `latte` بخورد، به‌عنوان
  // نوشیدنی گرم شمرده می‌شود و «بهترین قهوه‌ی سرد» غلط جواب می‌دهد.
  assert.equal(matchDish('آیس لاته نارگیل'), 'iced-latte')
  assert.equal(matchDish('آیس لاته'), 'iced-latte')
  assert.equal(matchDish('لاته'), 'latte')
  assert.equal(matchDish('آیس آمریکانو'), 'iced-americano')
  assert.equal(matchDish('آمریکانو'), 'americano')
})

test('matchDish آیتم خوراکی را دیشِ نوشیدنی نمی‌کند', () => {
  // «کیک لاته» در دسته‌ی دسر نباید `latte` شود، وگرنه «بهترین لاته نزدیک من»
  // کافه‌ای را پیشنهاد می‌دهد که فقط یک کیک با آن نام دارد.
  assert.equal(matchDish('کیک لاته', 'cake_dessert'), null)
  // برعکسش هم: «شیک بیسکویتی» در دسته‌ی نوشیدنی، کوکی نیست.
  assert.equal(matchDish('کروسان لاته', 'bakery'), 'croissant')
  // بدون context، تنها سیگنالِ موجود همان کلمه است.
  assert.equal(matchDish('کیک لاته'), 'latte')
})

test('matchDish در همان خانواده‌ی نوشیدنی آزاد است', () => {
  // دسته‌ی «نوشیدنی ها» (soft_drinks) اما آیتمش لاته است — باید بخورد.
  assert.equal(matchDish('لاته', 'soft_drinks'), 'latte')
  assert.equal(matchDish('موهیتو', 'soft_drinks'), 'mojito')
})

test('matchDish املاهای فارسی متفاوت را یکی می‌کند', () => {
  // «امریکانو» ۱۷ بار و «آمریکانو» ۳۲ بار در داده آمده.
  assert.equal(matchDish('امریکانو'), 'americano')
  assert.equal(matchDish('آمریکانو'), 'americano')
  assert.equal(matchDish('آیس امریکانو'), 'iced-americano')
})

test('matchDish دیش‌های پرتکرار منبع را می‌شناسد', () => {
  const expected: [string, string][] = [
    ['موهیتو', 'mojito'],
    ['لیموناد', 'lemonade'],
    ['سالاد سزار', 'caesar-salad'],
    ['هات چاکلت', 'hot-chocolate'],
    ['تیرامیسو', 'tiramisu'],
    ['چای ماسالا', 'masala-tea'],
    ['چای کرک', 'karak-tea'],
    ['کاپوچینو', 'cappuccino'],
    ['آفوگاتو', 'affogato'],
    ['پاستا چیکن آلفردو', 'alfredo-pasta'],
    ['پنه چیکن میلانز', 'penne-pasta'],
    ['پنه چیکن پستو', 'pesto-pasta'],
    ['پنه بیف پستو', 'pesto-pasta'],
    ['ماشروم برگر', 'mushroom-burger'],
    ['پیتزا پپرونی', 'pepperoni-pizza'],
    ['کروسان شکلاتی', 'croissant'],
    ['چیز کیک لوتوس', 'cheesecake'],
    ['قارچ سوخاری', 'fried-mushroom'],
    ['فرنچ فرایز', 'french-fries'],
    ['چلو کباب کوبیده', 'chelo-kabab'],
    ['ماچا لاته', 'matcha-latte'],
    ['لازانیا', 'lasagna'],
  ]
  for (const [name, slug] of expected) {
    assert.equal(matchDish(name), slug, name)
  }
})

test('لیموناد طبیعی از نوع بسته‌بندی جدا می‌ماند', () => {
  assert.equal(matchDish('لیموناد'), 'lemonade')
  assert.equal(matchDish('لیموناد طبیعی', 'mocktail', { price: 95_000 }), 'lemonade')
  assert.equal(matchDish('لیموناد شیشه‌ای'), 'packaged-lemonade')
  assert.equal(matchDish('لیموناد پت خوشگوار'), 'packaged-lemonade')
  assert.equal(matchDish('لیموناد کوچک'), 'packaged-lemonade')
  assert.equal(matchDish('نوشابه قوطی لیموناد'), 'packaged-lemonade')
  assert.equal(matchDish('لیموناد', 'soft_drinks', { price: 60_000 }), 'packaged-lemonade')
  assert.equal(matchDish('لیموناد', 'soft_drinks', { price: 180_000 }), 'lemonade')
})

test('matchDish نام یکتای کافه را null می‌دهد', () => {
  assert.equal(matchDish('آفرینش'), null)
  assert.equal(matchDish('کولاژ'), null)
  assert.equal(matchDish(''), null)
})

test('matchDish «چلو کباب لقمه» را کباب می‌داند', () => {
  const slug = matchDish('چلو کباب لقمه')
  assert.ok(slug === 'chelo-kabab' || slug === 'kabab-koubideh', `گرفت: ${slug}`)
})
