CREATE TABLE IF NOT EXISTS venue_discount (
  place_id INT NOT NULL PRIMARY KEY,
  percent INT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_user_id CHAR(36) NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT venue_discount_place_fk FOREIGN KEY (place_id) REFERENCES place(id) ON DELETE CASCADE,
  INDEX venue_discount_active_expiry_idx(active, expires_at)
);
