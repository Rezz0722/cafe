import assert from 'node:assert/strict'
import test from 'node:test'
import { researchAction, type ResearchBaseline, type ResearchCurrent } from './researchGuard'

const baseline: ResearchBaseline = { slug: 'example', address: 'street', revision: 0, attributes: [{ id: 'desserts', value: 2, confidence: 85, source: 'editorial', verifiedAt: '2026-09-28T00:00:00.000Z' }] }
const current = (): ResearchCurrent => ({ ...baseline, attributes: baseline.attributes.map(a => ({ ...a })), status: 'published' })
const target = { id: 'open_late', value: 1, confidence: 75, source: 'editorial', verifiedAt: '2026-10-07T00:00:00.000Z' }
test('outdoor review is additive and does not ignore an existing late-night signal', () => {
  const late = { ...current(), attributes: [...baseline.attributes, target] }
  const expected = { ...baseline, attributes: late.attributes }
  assert.equal(researchAction(expected, late, false, 'outdoor'), 'add')
  assert.throws(() => researchAction(baseline, late, false, 'outdoor'))
  const outdoor = { ...target, id: 'outdoor' }
  assert.equal(researchAction(expected, { ...late, attributes: [...late.attributes, outdoor] }, true, 'outdoor'), 'already-applied')
})
test('research guard adds only a missing target and preserves stronger baseline evidence', () => {
  assert.equal(researchAction(baseline, current(), false), 'add')
  assert.equal(baseline.attributes[0]?.confidence, 85)
})
test('quiet candidate preserves study and stronger breakfast evidence and requires its own audit', () => {
  const study = { ...target, id: 'good_for_study', confidence: 70 }
  const expected = { ...baseline, attributes: [...baseline.attributes, study] }
  const before = { ...current(), attributes: expected.attributes }
  const quiet = { ...target, id: 'quiet' }
  assert.equal(researchAction(expected, before, false, 'quiet'), 'add')
  const after = { ...before, attributes: [...before.attributes, quiet] }
  assert.throws(() => researchAction(expected, after, false, 'quiet'))
  assert.equal(researchAction(expected, after, true, 'quiet'), 'already-applied')
  assert.throws(() => researchAction(expected, { ...after, attributes: [quiet] }, true, 'quiet'))
})
test('research guard rejects changed identity, publication, revision and existing evidence', () => {
  for (const patch of [{ slug: 'other' }, { address: 'other' }, { revision: 1 }, { status: 'draft' }, { attributes: [] }]) assert.throws(() => researchAction(baseline, { ...current(), ...patch }, false))
})
test('research guard never overwrites an existing target, including identical unaudited values', () => {
  for (const value of [0, 1, 2]) assert.throws(() => researchAction(baseline, { ...current(), attributes: [...baseline.attributes, { ...target, value }] }, false))
})
test('research guard permits audited exact retry but rejects evidence removal or change', () => {
  const applied = { ...current(), attributes: [...baseline.attributes, target] }
  assert.equal(researchAction(baseline, applied, true), 'already-applied')
  assert.throws(() => researchAction(baseline, current(), true))
  assert.throws(() => researchAction(baseline, { ...applied, attributes: [...baseline.attributes, { ...target, value: 2 }] }, true))
})
