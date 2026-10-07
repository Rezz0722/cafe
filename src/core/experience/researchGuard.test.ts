import assert from 'node:assert/strict'
import test from 'node:test'
import { researchAction, type ResearchBaseline, type ResearchCurrent } from './researchGuard'

const baseline: ResearchBaseline = { slug: 'example', address: 'street', revision: 0, attributes: [{ id: 'desserts', value: 2, confidence: 85, source: 'editorial', verifiedAt: '2026-09-28T00:00:00.000Z' }] }
const current = (): ResearchCurrent => ({ ...baseline, attributes: baseline.attributes.map(a => ({ ...a })), status: 'published' })
const target = { id: 'open_late', value: 1, confidence: 75, source: 'editorial', verifiedAt: '2026-10-07T00:00:00.000Z' }
test('research guard adds only a missing target and preserves stronger baseline evidence', () => {
  assert.equal(researchAction(baseline, current(), false), 'add')
  assert.equal(baseline.attributes[0]?.confidence, 85)
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
