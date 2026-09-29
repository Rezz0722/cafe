-- تفکیک zero-result کافه از آیتم؛ migration افزایشی و سازگار با ردیف‌های قبلی.
ALTER TABLE search_log
  ADD COLUMN requested_scope ENUM('all', 'places', 'items') NOT NULL DEFAULT 'all' AFTER query,
  ADD COLUMN resolved_entity ENUM('places', 'items') NOT NULL DEFAULT 'places' AFTER requested_scope,
  ADD COLUMN resolved_intent VARCHAR(80) NULL AFTER resolved_entity;

CREATE INDEX search_log_zero_entity_idx
  ON search_log (result_count, resolved_entity, created_at);
