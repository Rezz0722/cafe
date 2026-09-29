-- فقط برای rollback اضطراری و پس از بازگردانی کد به نسخهٔ قبل اجرا شود.
ALTER TABLE menu_item DROP INDEX menu_item_source_id_uq;
ALTER TABLE menu_item DROP INDEX menu_item_public_id_uq;
ALTER TABLE menu_item DROP COLUMN public_id;
