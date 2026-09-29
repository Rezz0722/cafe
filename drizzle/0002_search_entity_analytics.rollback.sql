-- فقط برای rollback اضطراری؛ دادهٔ scope/intention ثبت‌شده را حذف می‌کند.
DROP INDEX search_log_zero_entity_idx ON search_log;

ALTER TABLE search_log
  DROP COLUMN resolved_intent,
  DROP COLUMN resolved_entity,
  DROP COLUMN requested_scope;
