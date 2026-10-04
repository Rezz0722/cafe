-- Additive sales intake. Existing claims, roles and audit_log are reused.
CREATE TABLE IF NOT EXISTS venue_lead (
  id CHAR(36) NOT NULL PRIMARY KEY,
  tracking_code CHAR(24) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  dedupe_key CHAR(64) NOT NULL,
  contact_name VARCHAR(120) NOT NULL,
  contact_phone VARCHAR(20) NOT NULL,
  cafe_name VARCHAR(160) NOT NULL,
  city VARCHAR(80) NOT NULL,
  branch VARCHAR(120) NOT NULL DEFAULT '',
  source VARCHAR(40) NOT NULL DEFAULT 'direct',
  consent_at TIMESTAMP NOT NULL,
  status ENUM('new','contacted','demo','review','active','rejected','closed') NOT NULL DEFAULT 'new',
  user_id CHAR(36) NULL,
  place_id INT NULL,
  claim_id INT NULL,
  assigned_to_user_id CHAR(36) NULL,
  next_follow_up_at TIMESTAMP NULL,
  internal_note TEXT NULL,
  revision INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY venue_lead_tracking_uq (tracking_code),
  UNIQUE KEY venue_lead_request_uq (request_hash),
  UNIQUE KEY venue_lead_dedupe_uq (dedupe_key),
  KEY venue_lead_status_idx (status,next_follow_up_at),
  KEY venue_lead_phone_idx (contact_phone),
  CONSTRAINT venue_lead_user_fk FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE SET NULL,
  CONSTRAINT venue_lead_place_fk FOREIGN KEY (place_id) REFERENCES place(id) ON DELETE SET NULL,
  CONSTRAINT venue_lead_assignee_fk FOREIGN KEY (assigned_to_user_id) REFERENCES app_user(id) ON DELETE SET NULL,
  CONSTRAINT venue_lead_claim_fk FOREIGN KEY (claim_id) REFERENCES place_claim(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS venue_lead_rate (
  bucket_key CHAR(64) NOT NULL PRIMARY KEY,
  window_start TIMESTAMP NOT NULL,
  requests INT NOT NULL DEFAULT 1,
  KEY venue_lead_rate_window_idx (window_start)
) ENGINE=InnoDB;
