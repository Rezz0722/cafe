-- Additive and repeatable. Historical import verification timestamps were
-- written by TopMenu Apply, so copy them as legacy sync times only.
ALTER TABLE place ADD COLUMN IF NOT EXISTS last_source_sync_at TIMESTAMP NULL DEFAULT NULL AFTER last_verified_at;

UPDATE place
-- MariaDB 10.6 created last_verified_at with an implicit ON UPDATE clause.
-- Explicitly retaining BOTH existing timestamps prevents this backfill from
-- advancing verification or the general edit time before 0017 repairs DDL.
SET last_source_sync_at = last_verified_at,
    last_verified_at = last_verified_at,
    updated_at = updated_at
WHERE source = 'import'
  AND source_id IS NOT NULL
  AND last_source_sync_at IS NULL
  AND last_verified_at IS NOT NULL;
