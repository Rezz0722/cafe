-- P2-05 core: additive tables only. No venue is opted in by this migration.
CREATE TABLE IF NOT EXISTS venue_booking_settings (
  place_id INT NOT NULL PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  request_from TIME NULL,
  request_until TIME NULL,
  max_party_size INT NULL,
  min_notice_minutes INT NOT NULL DEFAULT 60,
  max_advance_days INT NOT NULL DEFAULT 30,
  instructions VARCHAR(500) NULL,
  revision INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT venue_booking_settings_place_fk FOREIGN KEY (place_id) REFERENCES place(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS booking_request (
  id CHAR(36) NOT NULL PRIMARY KEY,
  place_id INT NOT NULL,
  requester_user_id CHAR(36) NOT NULL,
  kind ENUM('table','birthday','gathering','special_occasion') NOT NULL,
  experience_slug VARCHAR(48) NULL,
  requested_date DATE NOT NULL,
  requested_local_time TIME NOT NULL,
  party_size INT NOT NULL,
  duration_minutes INT NULL,
  needs_cake BOOLEAN NOT NULL DEFAULT FALSE,
  needs_decoration BOOLEAN NOT NULL DEFAULT FALSE,
  needs_private_space BOOLEAN NOT NULL DEFAULT FALSE,
  customer_note VARCHAR(1000) NULL,
  contact_phone VARCHAR(16) NOT NULL,
  consent_at TIMESTAMP NOT NULL,
  status ENUM('pending','confirmed','rejected','cancelled','expired','completed') NOT NULL DEFAULT 'pending',
  venue_response VARCHAR(1000) NULL,
  responded_at TIMESTAMP NULL DEFAULT NULL,
  responded_by_user_id CHAR(36) NULL,
  cancellation_reason VARCHAR(300) NULL,
  idempotency_key CHAR(36) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  revision INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY booking_request_user_idempotency_uq (requester_user_id, idempotency_key),
  KEY booking_request_user_created_idx (requester_user_id, created_at),
  KEY booking_request_place_status_date_idx (place_id, status, requested_date),
  CONSTRAINT booking_request_place_fk FOREIGN KEY (place_id) REFERENCES place(id),
  CONSTRAINT booking_request_user_fk FOREIGN KEY (requester_user_id) REFERENCES app_user(id),
  CONSTRAINT booking_request_responder_fk FOREIGN KEY (responded_by_user_id) REFERENCES app_user(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS booking_status_history (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  booking_id CHAR(36) NOT NULL,
  from_status ENUM('pending','confirmed','rejected','cancelled','expired','completed') NULL,
  to_status ENUM('pending','confirmed','rejected','cancelled','expired','completed') NOT NULL,
  actor_user_id CHAR(36) NULL,
  note VARCHAR(300) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY booking_history_request_created_idx (booking_id, created_at),
  CONSTRAINT booking_history_request_fk FOREIGN KEY (booking_id) REFERENCES booking_request(id) ON DELETE CASCADE,
  CONSTRAINT booking_history_actor_fk FOREIGN KEY (actor_user_id) REFERENCES app_user(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS booking_item_intent (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  booking_id CHAR(36) NOT NULL,
  menu_item_id INT NULL,
  menu_item_variant_id INT NULL,
  item_name VARCHAR(250) NOT NULL,
  variant_name VARCHAR(120) NULL,
  quantity INT NOT NULL,
  unit_price_toman INT NULL,
  price_unknown BOOLEAN NOT NULL DEFAULT FALSE,
  available_at_request BOOLEAN NOT NULL,
  KEY booking_item_intent_request_idx (booking_id),
  CONSTRAINT booking_item_intent_request_fk FOREIGN KEY (booking_id) REFERENCES booking_request(id) ON DELETE CASCADE,
  CONSTRAINT booking_item_intent_item_fk FOREIGN KEY (menu_item_id) REFERENCES menu_item(id) ON DELETE SET NULL,
  CONSTRAINT booking_item_intent_variant_fk FOREIGN KEY (menu_item_variant_id) REFERENCES menu_item_variant(id) ON DELETE SET NULL
) ENGINE=InnoDB;
