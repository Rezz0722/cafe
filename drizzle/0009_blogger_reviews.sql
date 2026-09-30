-- دسترسی بلاگر مستقل از نقش پایه است؛ مالک کافه هم می‌تواند بلاگر باشد.
CREATE TABLE IF NOT EXISTS blogger_profile (
  user_id CHAR(36) NOT NULL PRIMARY KEY,
  instagram_handle VARCHAR(64) NULL,
  bio VARCHAR(300) NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  verified_by_user_id CHAR(36) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT blogger_profile_user_fk FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE
) ENGINE=InnoDB;

ALTER TABLE review
  ADD COLUMN IF NOT EXISTS is_blogger_review BOOLEAN NOT NULL DEFAULT FALSE AFTER reject_reason,
  ADD COLUMN IF NOT EXISTS video_url VARCHAR(500) NULL AFTER is_blogger_review;

CREATE INDEX review_blogger_place_idx
  ON review (is_blogger_review, status, place_id);
