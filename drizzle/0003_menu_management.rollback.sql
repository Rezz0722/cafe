DROP INDEX menu_item_place_archive_idx ON menu_item;
ALTER TABLE menu_item DROP COLUMN archived_at;
