-- P2-05 events: additive only, no published events or imported participation.
CREATE TABLE IF NOT EXISTS venue_event (
  id CHAR(36) NOT NULL PRIMARY KEY,
  place_id INT NOT NULL,
  title VARCHAR(160) NOT NULL,
  description TEXT NOT NULL,
  start_date DATE NOT NULL,
  start_local_time TIME NOT NULL,
  end_date DATE NOT NULL,
  end_local_time TIME NOT NULL,
  category ENUM('music','workshop','tasting','community','other') NOT NULL,
  capacity INT NULL,
  terms TEXT NULL,
  participation_mode ENUM('interest','request') NOT NULL,
  cover_media_id INT NULL,
  status ENUM('draft','published','cancelled','ended') NOT NULL DEFAULT 'draft',
  revision INT NOT NULL DEFAULT 0,
  published_at TIMESTAMP NULL DEFAULT NULL,
  created_by_user_id CHAR(36) NOT NULL,
  updated_by_user_id CHAR(36) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY venue_event_public_idx (status,start_date,start_local_time),
  KEY venue_event_place_idx (place_id,start_date),
  CONSTRAINT venue_event_place_fk FOREIGN KEY (place_id) REFERENCES place(id),
  CONSTRAINT venue_event_cover_fk FOREIGN KEY (cover_media_id) REFERENCES media(id) ON DELETE SET NULL,
  CONSTRAINT venue_event_creator_fk FOREIGN KEY (created_by_user_id) REFERENCES app_user(id),
  CONSTRAINT venue_event_updater_fk FOREIGN KEY (updated_by_user_id) REFERENCES app_user(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS event_participation (
  id CHAR(36) NOT NULL PRIMARY KEY,
  event_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  status ENUM('interested','pending','confirmed','rejected','cancelled') NOT NULL,
  contact_phone VARCHAR(16) NULL,
  customer_note VARCHAR(500) NULL,
  venue_response VARCHAR(500) NULL,
  responded_by_user_id CHAR(36) NULL,
  responded_at TIMESTAMP NULL DEFAULT NULL,
  revision INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY event_participation_user_uq (event_id,user_id),
  KEY event_participation_user_idx (user_id,created_at),
  CONSTRAINT event_participation_event_fk FOREIGN KEY (event_id) REFERENCES venue_event(id),
  CONSTRAINT event_participation_user_fk FOREIGN KEY (user_id) REFERENCES app_user(id),
  CONSTRAINT event_participation_responder_fk FOREIGN KEY (responded_by_user_id) REFERENCES app_user(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS event_participation_history (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  participation_id CHAR(36) NOT NULL,
  from_status ENUM('interested','pending','confirmed','rejected','cancelled') NULL,
  to_status ENUM('interested','pending','confirmed','rejected','cancelled') NOT NULL,
  actor_user_id CHAR(36) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY event_participation_history_idx (participation_id,created_at),
  CONSTRAINT event_participation_history_participation_fk FOREIGN KEY (participation_id) REFERENCES event_participation(id) ON DELETE CASCADE,
  CONSTRAINT event_participation_history_actor_fk FOREIGN KEY (actor_user_id) REFERENCES app_user(id)
) ENGINE=InnoDB;
