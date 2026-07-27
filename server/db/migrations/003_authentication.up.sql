ALTER TABLE users
  ADD COLUMN account_kind VARCHAR(16) NOT NULL DEFAULT 'guest',
  ADD COLUMN email VARCHAR(320),
  ADD COLUMN password_hash TEXT,
  ADD COLUMN role VARCHAR(16) NOT NULL DEFAULT 'user',
  ADD COLUMN registered_at TIMESTAMPTZ;

ALTER TABLE users
  ADD CONSTRAINT users_account_kind_check CHECK (account_kind IN ('guest', 'registered')),
  ADD CONSTRAINT users_role_check CHECK (role IN ('user', 'admin')),
  ADD CONSTRAINT users_email_not_blank CHECK (email IS NULL OR (btrim(email) = email AND email <> '')),
  ADD CONSTRAINT users_registered_identity_check CHECK (
    (account_kind = 'guest' AND email IS NULL AND password_hash IS NULL AND registered_at IS NULL)
    OR
    (account_kind = 'registered' AND guest_id IS NULL AND email IS NOT NULL
      AND password_hash IS NOT NULL AND btrim(password_hash) <> '' AND registered_at IS NOT NULL)
  );

CREATE UNIQUE INDEX users_email_case_insensitive_unique_idx
  ON users (lower(email))
  WHERE email IS NOT NULL;

CREATE TABLE auth_sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT auth_sessions_token_hash_format CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT auth_sessions_expiry_after_creation CHECK (expires_at > created_at)
);

CREATE INDEX auth_sessions_active_token_idx
  ON auth_sessions (token_hash)
  WHERE revoked_at IS NULL;
CREATE INDEX auth_sessions_user_active_idx
  ON auth_sessions (user_id, expires_at DESC)
  WHERE revoked_at IS NULL;

CREATE TABLE guest_submission_claims (
  id UUID PRIMARY KEY,
  guest_user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
  claimed_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT guest_submission_claims_distinct_users CHECK (guest_user_id <> claimed_by_user_id)
);

CREATE INDEX guest_submission_claims_claimed_by_idx
  ON guest_submission_claims (claimed_by_user_id, claimed_at DESC);
