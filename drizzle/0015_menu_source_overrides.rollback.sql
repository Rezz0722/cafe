-- Only after exporting override rows and restoring pre-feature application code.
DROP TABLE IF EXISTS menu_item_field_override;
DROP TABLE IF EXISTS menu_section_field_override;
ALTER TABLE menu_section DROP COLUMN source_name;
