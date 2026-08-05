import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FACET_BY_ID, DISH_BY_SLUG } from '@/core/taxonomy/menuTaxonomy'
import { ATTRIBUTES } from '@/core/taxonomy/attributes'
import { computeTaste, hasAnyAnswer, QUIZ, sanitizeAnswers } from './quiz'
import { rankPlaces, scorePlace, type ScorableePlace } from './recommend'

// ═══ سلامت خودِ پرسش‌نامه ═══

test('شناسه‌ی سؤال‌ها و گزینه‌ها یکتاست', () => {
  const questionIds = QUIZ.map((question) => question.id)
  assert.equal(new Set(questionIds).size, questionIds.length)
  for (const question of QUIZ) {
    const optionIds = question.options.map((option) => option.id)
    assert.equal(new Set(optionIds).size, optionIds.length, question.id)
  }
})

test('هر وزن به facet/dish/attribute موجود اشاره می‌کند', () => {
  /*
    مهم‌ترین تست این فایل: گزینه‌ای که به facetِ ناموجود وزن می‌دهد، بی‌اثر
    است و کاربر بی‌دلیل به سؤالش جواب داده. این تست جلوی غلط املایی در
    شناسه‌ها را می‌گیرد.
  */
  const attributeIds = new Set(ATTRIBUTES.map((attribute) => attribute.id))
  for (const question of QUIZ) {
    for (const option of question.options) {
      for (const weight of option.weights) {
        const label = `${question.id}/${option.id} → ${weight.kind}:${weight.refId}`
        if (weight.kind === 'facet') {
          assert.ok(FACET_BY_ID.has(weight.refId), `facet ناموجود در ${label}`)
        } else if (weight.kind === 'dish') {
          assert.ok(DISH_BY_SLUG.has(weight.refId), `دیش ناموجود در ${label}`)
        } else if (weight.kind === 'attribute') {
          assert.ok(attributeIds.has(weight.refId), `ویژگی ناموجود در ${label}`)
        }
      }
    }
  }
})

test('سؤال بودجه سه گزینه با باند دارد', () => {
  const budget = QUIZ.find((question) => question.id === 'budget')!
  assert.equal(budget.multi, false)
  assert.deepEqual(
    budget.options.map((option) => option.budgetBand),
    [1, 2, 3],
  )
})

// ═══ محاسبه‌ی وزن ═══

test('computeTaste وزن‌ها را جمع و محدود می‌کند', () => {
  // «صبحانه» و «کیک و دسر» هر دو به bakery وزن می‌دهند.
  const result = computeTaste({ purpose: ['breakfast'], food: ['dessert'] })
  const bakery = result.weights.find((w) => w.kind === 'facet' && w.refId === 'bakery')
  assert.ok(bakery)
  assert.ok(bakery.weight <= 2, 'وزن باید در سقف ۲ بماند')
})

test('computeTaste باند بودجه را می‌گیرد', () => {
  assert.equal(computeTaste({ budget: ['low'] }).budgetBand, 1)
  assert.equal(computeTaste({ budget: ['high'] }).budgetBand, 3)
  assert.equal(computeTaste({}).budgetBand, null)
})

test('computeTaste وزن منفی را نگه می‌دارد', () => {
  const result = computeTaste({ hookah: ['no'] })
  const hookah = result.weights.find((w) => w.refId === 'hookah')
  assert.ok(hookah)
  assert.ok(hookah.weight < 0, 'ترجیحِ منفی باید منفی بماند')
})

test('computeTaste وزن صفر را دور می‌ریزد', () => {
  // «فرقی نمی‌کند» هیچ وزنی ندارد.
  const result = computeTaste({ hookah: ['dont_care'] })
  assert.equal(result.weights.length, 0)
  assert.equal(result.answered, 1, 'ولی پاسخ‌داده‌شده حساب می‌شود')
})

test('computeTaste گزینه‌ی ناشناس را بی‌صدا رد می‌کند', () => {
  const result = computeTaste({ purpose: ['__hacked__'], budget: ['low'] })
  assert.equal(result.budgetBand, 1)
  assert.equal(result.weights.length, 0)
})

test('sanitizeAnswers ورودی فرم را پاک می‌کند', () => {
  const clean = sanitizeAnswers({
    purpose: ['work', 'bogus', 'work'],
    budget: ['low', 'high'],
    nonexistent: ['x'],
  })
  assert.deepEqual(clean.purpose, ['work'], 'تکراری و ناشناس حذف می‌شوند')
  assert.deepEqual(clean.budget, ['low'], 'سؤال تک‌گزینه‌ای فقط اولی را می‌گیرد')
  assert.equal(clean.nonexistent, undefined)
})

test('hasAnyAnswer خالی را تشخیص می‌دهد', () => {
  assert.equal(hasAnyAnswer({}), false)
  assert.equal(hasAnyAnswer({ purpose: [] }), false)
  assert.equal(hasAnyAnswer({ purpose: ['work'] }), true)
})

// ═══ امتیازدهی ═══

const base: ScorableePlace = {
  id: 1,
  facetIds: [],
  districtId: 'sajad',
  priceTier: 2,
  rating: 4.2,
  ratingCount: 0,
  qualityScore: 70,
  dishSlugs: [],
  attributeIds: [],
}

test('scorePlace تطابق facet را پاداش می‌دهد', () => {
  const weights = [{ kind: 'facet' as const, refId: 'pasta', weight: 2 }]
  const withPasta = scorePlace({ ...base, facetIds: ['pasta'] }, { weights })
  const without = scorePlace(base, { weights })
  assert.ok(withPasta.score > without.score)
})

test('scorePlace دلیل می‌سازد', () => {
  const scored = scorePlace(
    { ...base, facetIds: ['pasta'] },
    {
      weights: [{ kind: 'facet', refId: 'pasta', weight: 2 }],
      labels: { 'facet:pasta': 'پاستا دارد' },
    },
  )
  assert.deepEqual(scored.reasons, ['پاستا دارد'])
})

test('scorePlace وزن منفی روی چیزی که کافه دارد، امتیاز را کم می‌کند', () => {
  const weights = [{ kind: 'facet' as const, refId: 'hookah', weight: -2 }]
  const withHookah = scorePlace({ ...base, facetIds: ['hookah'] }, { weights })
  const without = scorePlace(base, { weights })
  assert.ok(withHookah.score < without.score, 'کافه‌ی قلیان‌دار باید پایین بیفتد')
})

test('scorePlace نبودِ چیزِ ناخواسته را پاداش نمی‌دهد', () => {
  // وگرنه کافه‌ی بی‌منو برنده‌ی «قلیان نمی‌خواهم» می‌شد.
  const weights = [{ kind: 'facet' as const, refId: 'hookah', weight: -2 }]
  const empty = scorePlace({ ...base, facetIds: [] }, { weights })
  const noWeights = scorePlace({ ...base, facetIds: [] }, { weights: [] })
  assert.equal(empty.score, noWeights.score)
})

test('scorePlace باند بودجه‌ی دقیق را بیشتر از نزدیک پاداش می‌دهد', () => {
  const exact = scorePlace({ ...base, priceTier: 2 }, { weights: [], budgetBand: 2 })
  const near = scorePlace({ ...base, priceTier: 3 }, { weights: [], budgetBand: 2 })
  const far = scorePlace({ ...base, priceTier: 1 }, { weights: [], budgetBand: 3 })
  assert.ok(exact.score > near.score)
  assert.ok(near.score > far.score)
  assert.ok(far.score > 0, 'دور از بودجه حذف نمی‌شود، فقط امتیاز نمی‌گیرد')
})

test('scorePlace امتیاز کاربران را فقط با نظر واقعی حساب می‌کند', () => {
  const withReviews = scorePlace({ ...base, rating: 4.8, ratingCount: 20 }, { weights: [] })
  const noReviews = scorePlace({ ...base, rating: 4.8, ratingCount: 0 }, { weights: [] })
  assert.ok(withReviews.score > noReviews.score)
})

test('scorePlace کیفیت پروفایل را حساب می‌کند', () => {
  const complete = scorePlace({ ...base, qualityScore: 100 }, { weights: [] })
  const sparse = scorePlace({ ...base, qualityScore: 10 }, { weights: [] })
  assert.ok(complete.score > sparse.score, 'پیشنهادِ کافه‌ی بی‌اطلاعات کمکی نمی‌کند')
})

test('rankPlaces بی‌تطابق‌ها را حذف می‌کند', () => {
  const weights = [{ kind: 'facet' as const, refId: 'pasta', weight: 2 }]
  const labels = { 'facet:pasta': 'پاستا' }
  const ranked = rankPlaces(
    [
      { ...base, id: 1, facetIds: ['pasta'] },
      { ...base, id: 2, facetIds: ['pizza'] },
    ],
    { weights, labels },
  )
  assert.equal(ranked.length, 1, 'پیشنهادِ شخصی نباید کافه‌ی نامرتبط بدهد')
  assert.equal(ranked[0]!.place.id, 1)
})

test('rankPlaces با پروفایل خالی همه را نگه می‌دارد', () => {
  const ranked = rankPlaces(
    [
      { ...base, id: 1, qualityScore: 90 },
      { ...base, id: 2, qualityScore: 40 },
    ],
    { weights: [] },
  )
  assert.equal(ranked.length, 2)
  assert.equal(ranked[0]!.place.id, 1, 'با پروفایل خالی، کیفیت رتبه می‌دهد')
})

test('rankPlaces سقف تعداد را رعایت می‌کند', () => {
  const many = Array.from({ length: 40 }, (_, index) => ({ ...base, id: index }))
  assert.equal(rankPlaces(many, { weights: [], limit: 5 }).length, 5)
})
