import assert from 'node:assert/strict'
import test from 'node:test'
import { effectiveSearchScope, resolveProductIntent, splitProductAndPlaceQuery } from './resolveEntity'

test('generic menu categories resolve to item discovery', () => {
  assert.deepEqual(resolveProductIntent('قهوه'), {
    kind: 'facet',
    facetId: 'coffee',
    facetIds: ['coffee', 'cold_coffee', 'brewed_coffee'],
  })
  assert.deepEqual(resolveProductIntent('پاستا'), {
    kind: 'facet',
    facetId: 'pasta',
    facetIds: ['pasta'],
  })
})

test('a specific dish resolves to its canonical dish', () => {
  const result = resolveProductIntent('پاستا آلفردو')
  assert.equal(result.kind, 'dish')
  if (result.kind === 'dish') {
    assert.equal(result.dishSlug, 'alfredo-pasta')
    assert.equal(result.facetId, 'pasta')
  }
})

test('نام غذا و کافه در یک عبارت به دو فیلتر مستقل تبدیل می‌شوند', () => {
  const result = splitProductAndPlaceQuery('پیتزا پپرونی راموز')
  assert.equal(result.intent.kind, 'dish')
  if (result.intent.kind === 'dish') assert.equal(result.intent.dishSlug, 'pepperoni-pizza')
  assert.equal(result.placeQuery, 'راموز')

  const category = splitProductAndPlaceQuery('پاستا راموز')
  assert.equal(category.intent.kind, 'facet')
  if (category.intent.kind === 'facet') assert.equal(category.intent.facetId, 'pasta')
  assert.equal(category.placeQuery, 'راموز')
})

test('جست‌وجوی لیموناد، طبیعی و بسته‌بندی را مخلوط نمی‌کند', () => {
  const fresh = resolveProductIntent('لیموناد')
  const packaged = resolveProductIntent('لیموناد شیشه‌ای')
  assert.equal(fresh.kind, 'dish')
  assert.equal(packaged.kind, 'dish')
  if (fresh.kind === 'dish') assert.equal(fresh.dishSlug, 'lemonade')
  if (packaged.kind === 'dish') assert.equal(packaged.dishSlug, 'packaged-lemonade')
})

test('unknown text stays place-first unless the user selects items', () => {
  const unknown = resolveProductIntent('کافه رُز')
  assert.deepEqual(unknown, { kind: 'unknown' })
  assert.equal(effectiveSearchScope('all', unknown), 'places')
  assert.equal(effectiveSearchScope('items', unknown), 'items')
})

test('یک غلط املایی روشن در خوراکی به موجودیت درست می‌رسد', () => {
  const result = resolveProductIntent('پاستاا')
  assert.notEqual(result.kind, 'unknown')
  if (result.kind === 'facet') assert.equal(result.facetId, 'pasta')
})
