-- Additive. No historical row is labeled owner-verified.
ALTER TABLE menu_section ADD COLUMN source_name VARCHAR(200) NULL;

CREATE TABLE IF NOT EXISTS menu_item_field_override (
  item_id INT NOT NULL,
  field_name VARCHAR(32) NOT NULL,
  actor_user_id VARCHAR(36) NOT NULL,
  reason VARCHAR(200) NOT NULL DEFAULT 'venue_edit',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (item_id, field_name),
  CONSTRAINT menu_item_field_override_item_fk FOREIGN KEY (item_id) REFERENCES menu_item(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS menu_section_field_override (
  section_id INT NOT NULL,
  field_name VARCHAR(32) NOT NULL,
  actor_user_id VARCHAR(36) NOT NULL,
  reason VARCHAR(200) NOT NULL DEFAULT 'venue_edit',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (section_id, field_name),
  CONSTRAINT menu_section_field_override_section_fk FOREIGN KEY (section_id) REFERENCES menu_section(id) ON DELETE CASCADE
) ENGINE=InnoDB;
