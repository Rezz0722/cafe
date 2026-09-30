import assert from 'node:assert/strict'
import test from 'node:test'
import { ATTRIBUTE_BY_ID } from '@/core/taxonomy/attributes'
import {
  EXPERIENCES,
  EXPERIENCE_CURATION_ATTRIBUTE_IDS,
  EXPERIENCE_PRIMARY_ATTRIBUTE_IDS,
} from './registry'

test('experience registry uses unique stable slugs and known attributes', () => {
  assert.equal(new Set(EXPERIENCES.map((item) => item.slug)).size, EXPERIENCES.length)
  for (const experience of EXPERIENCES) {
    assert.ok(ATTRIBUTE_BY_ID.has(experience.primaryAttributeId))
    for (const id of experience.supportingAttributeIds) assert.ok(ATTRIBUTE_BY_ID.has(id))
    assert.match(experience.image, /^\/experiences\/.+\.webp$/)
  }
})

test('curation ids include every primary signal without duplicates', () => {
  assert.equal(new Set(EXPERIENCE_CURATION_ATTRIBUTE_IDS).size, EXPERIENCE_CURATION_ATTRIBUTE_IDS.length)
  for (const id of EXPERIENCE_PRIMARY_ATTRIBUTE_IDS) {
    assert.ok(EXPERIENCE_CURATION_ATTRIBUTE_IDS.includes(id))
  }
})
