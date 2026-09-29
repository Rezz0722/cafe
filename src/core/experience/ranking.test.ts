import assert from 'node:assert/strict'
import test from 'node:test'
import { EXPERIENCE_BY_SLUG } from './registry'
import { compareExperienceRank, experienceRank } from './ranking'

const work = EXPERIENCE_BY_SLUG.get('work')!

test('confirmed primary signal outranks partial signal', () => {
  const confirmed = experienceRank(work, [{ attributeId: 'laptop_friendly', value: 2, confidence: 75, source: 'editorial', verifiedAt: null }])
  const partial = experienceRank(work, [{ attributeId: 'laptop_friendly', value: 1, confidence: 100, source: 'field_visit', verifiedAt: null }])
  assert.ok(compareExperienceRank(confirmed, partial) < 0)
})

test('supporting evidence breaks ties without replacing the primary criterion', () => {
  const richer = experienceRank(work, [
    { attributeId: 'laptop_friendly', value: 2, confidence: 75, source: 'editorial', verifiedAt: null },
    { attributeId: 'power_outlets', value: 2, confidence: 75, source: 'editorial', verifiedAt: null },
  ])
  const basic = experienceRank(work, [{ attributeId: 'laptop_friendly', value: 2, confidence: 75, source: 'editorial', verifiedAt: null }])
  assert.ok(compareExperienceRank(richer, basic) < 0)
})
