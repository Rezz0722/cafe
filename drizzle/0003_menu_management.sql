-- چرخه‌ی عمر مستقل برای آیتم منو: «ناموجود» با «حذف‌شده» یکی نیست.
ALTER TABLE menu_item
  ADD COLUMN archived_at TIMESTAMP NULL AFTER sort_order;

CREATE INDEX menu_item_place_archive_idx
  ON menu_item (place_id, archived_at, section_id, sort_order);
