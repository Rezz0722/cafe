-- Optional only after preserving/exporting source-sync timestamps recorded
-- since this migration. Roll back application code first.
ALTER TABLE place DROP COLUMN IF EXISTS last_source_sync_at;
