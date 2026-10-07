import assert from 'node:assert/strict'

export type ResearchAttribute = { id: string; value: number; confidence: number; source: string; verifiedAt: string | null }
export type ResearchBaseline = { slug: string; address: string | null; revision: number; attributes: ResearchAttribute[] }
export type ResearchCurrent = ResearchBaseline & { status: string }

const normalized = (rows: ResearchAttribute[]) => [...rows].sort((a, b) => a.id.localeCompare(b.id))

/** Additive-only guard. A matching value without this batch's audit is NOT a safe retry. */
export function researchAction(expected: ResearchBaseline, current: ResearchCurrent, batchAudit: boolean): 'add' | 'already-applied' {
  assert.equal(current.status, 'published', 'Place is no longer published')
  for (const key of ['slug', 'address', 'revision'] as const) assert.equal(current[key], expected[key], `Changed ${key}`)
  assert.ok(!expected.attributes.some(a => a.id === 'open_late'), 'Baseline already contains target')
  assert.deepEqual(normalized(current.attributes.filter(a => a.id !== 'open_late')), normalized(expected.attributes), 'Existing evidence changed')
  const target = current.attributes.find(a => a.id === 'open_late')
  if (!target) {
    assert.equal(batchAudit, false, 'Previously applied record was removed; manual review required')
    return 'add'
  }
  assert.ok(batchAudit && target.value === 1 && target.source === 'editorial' && target.confidence === 75 && target.verifiedAt, 'Target conflicts with research batch')
  return 'already-applied'
}
