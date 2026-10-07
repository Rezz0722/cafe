-- Additive only; retains printed links and counters when code is rolled back.
CREATE TABLE IF NOT EXISTS venue_qr_link (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  place_id INT NOT NULL,
  token CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  label VARCHAR(80) NOT NULL,
  label_key VARCHAR(80) NOT NULL,
  kind ENUM('table','channel') NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  opens BIGINT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY venue_qr_token_uq (token),
  UNIQUE KEY venue_qr_label_uq (place_id,label_key),
  CONSTRAINT venue_qr_place_fk FOREIGN KEY (place_id) REFERENCES place(id) ON DELETE CASCADE
) ENGINE=InnoDB;
