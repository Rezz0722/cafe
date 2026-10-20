-- Preserve existing challenge expiry values. Never revive an expired code.
-- An explicit fail-closed default prevents MariaDB 10.6 from implicitly adding
-- ON UPDATE CURRENT_TIMESTAMP to the first TIMESTAMP column.
ALTER TABLE otp_code MODIFY expires_at TIMESTAMP NOT NULL DEFAULT '1970-01-02 00:00:00';
