ALTER TABLE users ADD COLUMN email_verified_at TIMESTAMPTZ;

-- Preserve access for accounts that existed before email verification was introduced.
UPDATE users
SET email_verified_at = CURRENT_TIMESTAMP
WHERE account_kind = 'registered' AND email_verified_at IS NULL;

CREATE TABLE email_verification_codes (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash CHAR(64) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT email_verification_codes_hash_format CHECK (code_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT email_verification_codes_expiry_after_creation CHECK (expires_at > created_at)
);

CREATE INDEX email_verification_codes_active_idx
  ON email_verification_codes (user_id, expires_at DESC)
  WHERE consumed_at IS NULL;
