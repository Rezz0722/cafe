import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  annotateSourceAvailability,
  isTargetCheckboxDisabled,
  parseTopMenuSelection,
  selectTopMenuCafes,
  staleSelectionIds,
  type TopMenuTarget,
} from './topMenuSelection'
const cafes = [{ 'شناسه': 12, 'نام مجموعه': 'اول' }, { 'شناسه': 25, 'نام مجموعه': 'دوم' }]
test('selected cafes are scoped by source ID and do not mutate source', () => {
  const selected = selectTopMenuCafes(cafes, parseTopMenuSelection('selected', [25, 25]))
  assert.deepEqual(selected, [cafes[1]]); assert.equal(cafes.length, 2)
})
test('full sync must be explicit', () => {
  assert.equal(selectTopMenuCafes(cafes, parseTopMenuSelection('all', [])), cafes)
  assert.throws(() => parseTopMenuSelection(undefined, undefined))
  assert.throws(() => parseTopMenuSelection('all', [12]))
})
test('empty or invalid selection never falls back to all', () => {
  for (const ids of [[], null, ['12'], [true], [0], [-1], [1.2], [Infinity], [2147483648], Array(1001).fill(12)])
    assert.throws(() => parseTopMenuSelection('selected', ids))
})
test('unknown or missing source rejects partial apply', () => {
  assert.throws(() => selectTopMenuCafes(cafes, parseTopMenuSelection('selected', [12, 999])))
})

// ── حضور در منبع ────────────────────────────────────────────────────────────
// رگرسیونِ واقعی: منبع سه مجموعه را حذف کرده بود، آن‌ها در کاتالوگِ دیتابیس
// ماندند، و یک انتخابِ ۳۵۲تایی کل اجرا را می‌کشت.

const catalog: TopMenuTarget[] = [
  { sourceId: 325, placeId: 194, name: 'کافه ونگوگ', username: 'vangogh' },
  { sourceId: 608, placeId: 316, name: 'کافه پیتزا ابرش', username: 'abrash' },
  { sourceId: 165, placeId: 40, name: 'سالم', username: 'salem' },
]

test('cafes missing from the source list are flagged, present ones are not', () => {
  const marked = annotateSourceAvailability(catalog, [165])
  assert.equal(marked[0]!.inSource, false)
  assert.equal(marked[1]!.inSource, false)
  assert.equal(marked[2]!.inSource, true)
})

test('an unreadable source list never marks anything as removed', () => {
  // نبودِ سند، دلیلِ نبودِ مجموعه نیست. آرایهٔ خالی یعنی «نمی‌دانیم».
  for (const known of [[], []]) {
    assert.deepEqual(annotateSourceAvailability(catalog, known), catalog)
    assert.deepEqual(staleSelectionIds(catalog, [325, 165]), [])
  }
})

test('a snapshot row is already known to be in the source', () => {
  const marked = annotateSourceAvailability([{ sourceId: 999, placeId: null, name: 'تازه', username: '', inSource: true }], [])
  assert.equal(marked[0]!.inSource, true)
})

test('staleSelectionIds names only the removed ones, in selection order', () => {
  const marked = annotateSourceAvailability(catalog, [165])
  assert.deepEqual(staleSelectionIds(marked, [165, 608, 325]), [608, 325])
  assert.deepEqual(staleSelectionIds(marked, [165]), [])
})

test('unknown availability is never blocked — the scraper guard decides', () => {
  // inSource تعریف‌نشده یعنی «نمی‌دانیم»، نه «حذف شده». گاردِ سخت‌گیرِ
  // topmarket.py باید تنها جایی بماند که این حالت را متوقف می‌کند.
  const unknown = [{ sourceId: 7, placeId: null, name: 'نامعلوم', username: '' }] satisfies TopMenuTarget[]
  assert.deepEqual(staleSelectionIds(unknown, [7]), [])
  assert.throws(() => selectTopMenuCafes([], parseTopMenuSelection('selected', [7])))
})

// ── قفل چک‌باکس ─────────────────────────────────────────────────────────────
// رگرسیونِ واقعیِ دوم: `disabled` روی ردیفِ تیک‌خورده، ادمین را در انتخابی گیر
// انداخت که نه قابل اصلاح بود و نه قابل اجرا.

test('a removed café already ticked stays untickable — no dead end', () => {
  // اگر این قفل بود، تنها راهِ خروج از انتخابی می‌شد که سرور رد می‌کند.
  const ticked = annotateSourceAvailability(catalog, [165])[0]!
  assert.equal(ticked.inSource, false)
  assert.equal(isTargetCheckboxDisabled(ticked, [ticked.sourceId]), false)
  assert.equal(isTargetCheckboxDisabled(ticked, [ticked.sourceId, 165]), false)
})

test('a removed café not yet ticked cannot be newly ticked', () => {
  const removed = annotateSourceAvailability(catalog, [165])[0]!
  assert.equal(isTargetCheckboxDisabled(removed, []), true)
  assert.equal(isTargetCheckboxDisabled(removed, [165]), true)
})

test('healthy and unknown cafés are never locked', () => {
  const healthy = annotateSourceAvailability(catalog, [165])[2]!
  const unknown = { sourceId: 7, placeId: null, name: 'نامعلوم', username: '' } satisfies TopMenuTarget
  assert.equal(isTargetCheckboxDisabled(healthy, []), false)
  assert.equal(isTargetCheckboxDisabled(unknown, []), false)
})
