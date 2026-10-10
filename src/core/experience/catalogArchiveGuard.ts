import assert from 'node:assert/strict'

export type CatalogArchiveBaseline = { id: number; slug: string; sourceId: number; status: string; revision: number; menuRows: number; menuHash: string }
export type CatalogArchiveCurrent = { id: number; slug: string; source_id: number; status: string; revision: number }

/** Never infer business type here; only an explicitly reviewed, locked packet is eligible. */
export function catalogArchiveAction(expected: CatalogArchiveBaseline, current: CatalogArchiveCurrent, menuRows: number, menuHash: string, ownerLinks: number, latestArchiveBatch: string | null, expectedBatch = 'non-venue-cleanup-20261008'): 'archive' | 'already-archived' {
  assert.equal(current.id, expected.id)
  assert.equal(current.slug, expected.slug, 'Slug changed')
  assert.equal(current.source_id, expected.sourceId, 'Import identity changed')
  assert.equal(ownerLinks, 0, 'Owner assignment requires separate review')
  assert.equal(menuRows, expected.menuRows, 'Catalogue row count changed')
  assert.equal(menuHash, expected.menuHash, 'Catalogue changed')
  if (latestArchiveBatch === expectedBatch) {
    assert.equal(current.status, 'draft')
    assert.equal(current.revision, expected.revision + 1)
    return 'already-archived'
  }
  assert.equal(latestArchiveBatch, null, 'Different archive/restore history requires review')
  assert.equal(current.status, expected.status, 'Status changed')
  assert.equal(current.revision, expected.revision, 'Revision changed')
  return 'archive'
}
