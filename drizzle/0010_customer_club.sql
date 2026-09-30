CREATE TABLE IF NOT EXISTS club_membership (
  user_id CHAR(36) NOT NULL, place_id INT NOT NULL,
  status ENUM('active','left','blocked') NOT NULL DEFAULT 'active',
  consent_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id, place_id), KEY club_membership_place_idx(place_id,status),
  CONSTRAINT club_member_user_fk FOREIGN KEY(user_id) REFERENCES app_user(id) ON DELETE CASCADE,
  CONSTRAINT club_member_place_fk FOREIGN KEY(place_id) REFERENCES place(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS club_offer (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, place_id INT NOT NULL,
  title VARCHAR(120) NOT NULL, description VARCHAR(500) NULL,
  discount_label VARCHAR(80) NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE,
  expires_at TIMESTAMP NULL, created_by_user_id CHAR(36) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY club_offer_place_idx(place_id,active),
  CONSTRAINT club_offer_place_fk FOREIGN KEY(place_id) REFERENCES place(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS club_code (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, offer_id INT NOT NULL, user_id CHAR(36) NOT NULL,
  code VARCHAR(16) NOT NULL, status ENUM('issued','redeemed','cancelled','expired') NOT NULL DEFAULT 'issued',
  issued_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, redeemed_at TIMESTAMP NULL,
  redeemed_by_user_id CHAR(36) NULL,
  UNIQUE KEY club_code_code_uq(code), KEY club_code_user_idx(user_id,status),
  CONSTRAINT club_code_offer_fk FOREIGN KEY(offer_id) REFERENCES club_offer(id) ON DELETE CASCADE,
  CONSTRAINT club_code_user_fk FOREIGN KEY(user_id) REFERENCES app_user(id) ON DELETE CASCADE
) ENGINE=InnoDB;
