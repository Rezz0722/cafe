import assert from 'node:assert/strict'
import test from 'node:test'
import { catalogArchiveAction } from './catalogArchiveGuard'
const baseline = { id: 403, slug: 'dorkavstone-p', sourceId: 711, status: 'published', revision: 0, menuRows: 39, menuHash: 'hash' }
const current = { id: 403, slug: baseline.slug, source_id: 711, status: 'published', revision: 0 }
test('reviewed archive preserves catalogue and only matches exact identity', () => {
  assert.equal(catalogArchiveAction(baseline, current, 39, 'hash', 0, null), 'archive')
  for (const patch of [{ id: 404 }, { slug: 'cafe' }, { source_id: 710 }, { status: 'draft' }, { revision: 1 }]) assert.throws(() => catalogArchiveAction(baseline, { ...current, ...patch }, 39, 'hash', 0, null))
})
test('archive rejects catalogue changes and owner assignments', () => {
  assert.throws(() => catalogArchiveAction(baseline, current, 40, 'hash', 0, null))
  assert.throws(() => catalogArchiveAction(baseline, current, 39, 'other', 0, null))
  assert.throws(() => catalogArchiveAction(baseline, current, 39, 'hash', 1, null))
})
test('retry must match exact batch audit and revision, not an unrelated draft', () => {
  const archived = { ...current, status: 'draft', revision: 1 }
  assert.equal(catalogArchiveAction(baseline, archived, 39, 'hash', 0, 'non-venue-cleanup-20261008'), 'already-archived')
  assert.throws(() => catalogArchiveAction(baseline, archived, 39, 'hash', 0, 'other'))
  assert.throws(() => catalogArchiveAction(baseline, current, 39, 'hash', 0, 'non-venue-cleanup-20261008'))
})
test('a second reviewed batch can be retried only against its own audit', () => {
  const batch = 'provider-demo-cleanup-20261010'
  const archived = { ...current, status: 'draft', revision: 1 }
  assert.equal(catalogArchiveAction(baseline, current, 39, 'hash', 0, null, batch), 'archive')
  assert.equal(catalogArchiveAction(baseline, archived, 39, 'hash', 0, batch, batch), 'already-archived')
  assert.throws(() => catalogArchiveAction(baseline, archived, 39, 'hash', 0, 'non-venue-cleanup-20261008', batch))
})
