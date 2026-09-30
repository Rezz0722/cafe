-- Phase 1: revocable sessions, verified phones, and explicit brand/branch scope.
-- A compressed database backup must exist before this migration is applied.

ALTER TABLE app_user
  MODIFY status ENUM('active', 'blocked', 'deactivated') NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMP NULL DEFAULT NULL AFTER status;

ALTER TABLE auth_session
  ADD INDEX IF NOT EXISTS auth_session_user_idx (user_id);

CREATE TABLE IF NOT EXISTS place_brand (
  id INT NOT NULL AUTO_INCREMENT,
  slug VARCHAR(140) NOT NULL,
  name VARCHAR(200) NOT NULL,
  name_en VARCHAR(200) NULL,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT place_brand_id PRIMARY KEY (id),
  UNIQUE INDEX place_brand_slug_uq (slug)
) ENGINE=InnoDB;

ALTER TABLE place
  ADD COLUMN IF NOT EXISTS brand_id INT NULL AFTER source_username,
  ADD COLUMN IF NOT EXISTS branch_name VARCHAR(160) NULL AFTER brand_id,
  ADD COLUMN IF NOT EXISTS is_primary_branch BOOLEAN NOT NULL DEFAULT FALSE AFTER branch_name,
  ALGORITHM=INPLACE, LOCK=SHARED;

ALTER TABLE place
  ADD INDEX IF NOT EXISTS place_brand_idx (brand_id, status),
  ALGORITHM=INPLACE, LOCK=SHARED;

SET FOREIGN_KEY_CHECKS = 0;
ALTER TABLE place
  ADD CONSTRAINT place_brand_id_fk FOREIGN KEY (brand_id)
    REFERENCES place_brand(id) ON DELETE SET NULL,
  ALGORITHM=INPLACE, LOCK=SHARED;
SET FOREIGN_KEY_CHECKS = 1;

ALTER TABLE menu_section
  ADD COLUMN IF NOT EXISTS branch_scope ENUM('shared', 'branch', 'other_branch', 'unverified')
    NOT NULL DEFAULT 'shared' AFTER facet_id,
  ADD COLUMN IF NOT EXISTS branch_label VARCHAR(200) NULL AFTER branch_scope,
  ADD INDEX IF NOT EXISTS menu_section_scope_idx (place_id, branch_scope, sort_order),
  ALGORITHM=INPLACE, LOCK=SHARED;

-- The source exposes Ramouz as one provider although its section names name
-- multiple branches. The known address belongs to Qazi Tabatabai. Preserve all
-- source rows, but prevent other branches' sections from being published here.
INSERT INTO place_brand (slug, name, name_en)
SELECT 'ramouz', 'کافه راموز', 'Ramouz Cafe'
WHERE EXISTS (SELECT 1 FROM place WHERE source_id = 38)
  AND NOT EXISTS (SELECT 1 FROM place_brand WHERE slug = 'ramouz');

UPDATE place
SET brand_id = (SELECT id FROM place_brand WHERE slug = 'ramouz' LIMIT 1),
    branch_name = 'قاضی طباطبایی',
    is_primary_branch = TRUE,
    name = 'کافه راموز — شعبه قاضی طباطبایی',
    name_normalized = 'کافه راموز شعبه قاضی طباطبایی'
WHERE source_id = 38;

UPDATE menu_section
SET branch_scope = CASE
      WHEN name REGEXP 'قاضی[[:space:]]*طباطب' THEN 'branch'
      WHEN name REGEXP 'حافظ|آرمیتاژ|ارمیتاژ|ژلاتو|جلاتو|ابوذر|سجاد' THEN 'other_branch'
      ELSE 'shared'
    END,
    branch_label = CASE
      WHEN name REGEXP 'قاضی[[:space:]]*طباطب' THEN 'قاضی طباطبایی'
      WHEN name REGEXP 'حافظ|آرمیتاژ|ارمیتاژ' THEN 'حافظ و آرمیتاژ'
      WHEN name REGEXP 'ژلاتو|جلاتو' THEN 'ژلاتو'
      WHEN name REGEXP 'ابوذر.*سجاد|سجاد.*ابوذر' THEN 'ابوذر غفاری و سجاد'
      WHEN name REGEXP 'ابوذر' THEN 'ابوذر غفاری'
      WHEN name REGEXP 'سجاد' THEN 'سجاد'
      ELSE NULL
    END
WHERE place_id = (SELECT id FROM place WHERE source_id = 38 LIMIT 1);
