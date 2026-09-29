-- هویت عمومی پایدار MenuItem؛ id داخلی نباید وارد URL شود.
-- مقدار آیتم‌های importشده برابر source_id می‌ماند و پس از re-import عوض نمی‌شود.
ALTER TABLE menu_item
  ADD COLUMN public_id VARCHAR(40) NULL AFTER id;

UPDATE menu_item
SET public_id = CAST(source_id AS CHAR)
WHERE public_id IS NULL AND source_id IS NOT NULL;

-- گارد برای دادهٔ قدیمی بدون source؛ روی snapshot فعلی چنین ردیفی وجود ندارد.
UPDATE menu_item
SET public_id = CONCAT('legacy_', LPAD(id, 10, '0'))
WHERE public_id IS NULL;

ALTER TABLE menu_item
  MODIFY public_id VARCHAR(40) NOT NULL;

ALTER TABLE menu_item
  ADD UNIQUE INDEX menu_item_public_id_uq (public_id);

ALTER TABLE menu_item
  ADD UNIQUE INDEX menu_item_source_id_uq (source_id);
