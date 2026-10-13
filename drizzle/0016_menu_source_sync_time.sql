-- Additive and repeatable. Historical import verification timestamps were
-- written by TopMenu Apply, so copy them as legacy sync times only.
ALTER TABLE place ADD COLUMN IF NOT EXISTS last_source_sync_at TIMESTAMP NULL DEFAULT NULL AFTER last_verified_at;

UPDATE place
SET last_source_sync_at = last_verified_at
WHERE source = 'import'
  AND source_id IS NOT NULL
  AND last_source_sync_at IS NULL
  AND last_verified_at IS NOT NULL;
