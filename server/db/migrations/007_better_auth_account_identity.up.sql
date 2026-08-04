-- An OAuth provider identity may belong to exactly one local user. Better
-- Auth relies on this invariant when it finds or links Google accounts.
CREATE UNIQUE INDEX IF NOT EXISTS account_provider_identity_unique_idx
  ON account ("providerId", "accountId");

-- Accounts created before Better Auth stored their scrypt hash on `users`.
-- Import it once into Better Auth's credential account table, preserving both
-- passwords and roles without keeping a second login implementation alive.
INSERT INTO account ("accountId", "providerId", "userId", password, "createdAt", "updatedAt")
SELECT email, 'credential', id, password_hash, created_at, updated_at
FROM users
WHERE account_kind = 'registered'
  AND email IS NOT NULL
  AND password_hash IS NOT NULL
  AND btrim(password_hash) <> ''
ON CONFLICT ("providerId", "accountId") DO NOTHING;

UPDATE users
SET "emailVerified" = TRUE
WHERE email_verified_at IS NOT NULL
  AND COALESCE("emailVerified", FALSE) = FALSE;
