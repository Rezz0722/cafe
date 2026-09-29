-- Roll back only after restoring/inspecting the pre-phase backup.
ALTER TABLE auth_session DROP INDEX IF EXISTS auth_session_user_idx;

SET FOREIGN_KEY_CHECKS = 0;
ALTER TABLE place DROP FOREIGN KEY IF EXISTS place_brand_id_fk;
SET FOREIGN_KEY_CHECKS = 1;

ALTER TABLE menu_section
  DROP INDEX IF EXISTS menu_section_scope_idx,
  DROP COLUMN IF EXISTS branch_label,
  DROP COLUMN IF EXISTS branch_scope,
  ALGORITHM=INPLACE, LOCK=SHARED;

ALTER TABLE place
  DROP INDEX IF EXISTS place_brand_idx,
  DROP COLUMN IF EXISTS is_primary_branch,
  DROP COLUMN IF EXISTS branch_name,
  DROP COLUMN IF EXISTS brand_id,
  ALGORITHM=INPLACE, LOCK=SHARED;

DROP TABLE IF EXISTS place_brand;

ALTER TABLE app_user
  DROP COLUMN IF EXISTS phone_verified_at,
  MODIFY status ENUM('active', 'blocked') NOT NULL DEFAULT 'active';
