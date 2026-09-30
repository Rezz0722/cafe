ALTER TABLE place_photo DROP INDEX IF EXISTS place_photo_media_uq;
ALTER TABLE place DROP COLUMN IF EXISTS revision;
DROP TABLE IF EXISTS menu_item_variant;
