-- Align live MariaDB 10.6 with Drizzle's nullable, explicitly-set provenance
-- dates. Its implicit first-TIMESTAMP behavior attached ON UPDATE to both
-- place.last_verified_at and menu_item.price_updated_at. The guards avoid
-- rebuilding either table on every deploy.
SET @kucafe_fix_verified_timestamp = (
  SELECT IF(COUNT(*) = 1, 1, 0)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'place'
    AND COLUMN_NAME = 'last_verified_at'
    AND (IS_NULLABLE <> 'YES' OR EXTRA LIKE '%on update%'
      OR (COLUMN_DEFAULT IS NOT NULL AND UPPER(COLUMN_DEFAULT) <> 'NULL'))
);
SET @kucafe_fix_verified_sql = IF(
  @kucafe_fix_verified_timestamp = 1,
  'ALTER TABLE place MODIFY COLUMN last_verified_at TIMESTAMP NULL DEFAULT NULL',
  'SELECT 1'
);
PREPARE kucafe_fix_verified_stmt FROM @kucafe_fix_verified_sql;
EXECUTE kucafe_fix_verified_stmt;
DEALLOCATE PREPARE kucafe_fix_verified_stmt;

SET @kucafe_fix_price_timestamp = (
  SELECT IF(COUNT(*) = 1, 1, 0)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'menu_item'
    AND COLUMN_NAME = 'price_updated_at'
    AND (IS_NULLABLE <> 'YES' OR EXTRA LIKE '%on update%'
      OR (COLUMN_DEFAULT IS NOT NULL AND UPPER(COLUMN_DEFAULT) <> 'NULL'))
);
SET @kucafe_fix_price_sql = IF(
  @kucafe_fix_price_timestamp = 1,
  'ALTER TABLE menu_item MODIFY COLUMN price_updated_at TIMESTAMP NULL DEFAULT NULL',
  'SELECT 1'
);
PREPARE kucafe_fix_price_stmt FROM @kucafe_fix_price_sql;
EXECUTE kucafe_fix_price_stmt;
DEALLOCATE PREPARE kucafe_fix_price_stmt;

-- An item with no recorded price has no dated price change to show. MariaDB's
-- old implicit default assigned one anyway; clear only these invalid dates.
UPDATE menu_item SET price_updated_at = NULL
WHERE price IS NULL AND price_updated_at IS NOT NULL;
