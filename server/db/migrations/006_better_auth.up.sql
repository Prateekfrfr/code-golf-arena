ALTER TABLE users ADD COLUMN IF NOT EXISTS "emailVerified" BOOLEAN DEFAULT false;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_registered_identity_check;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_registered_username_check;
ALTER TABLE users ALTER COLUMN account_kind SET DEFAULT 'registered';

CREATE TABLE IF NOT EXISTS session (
  id TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  token TEXT NOT NULL UNIQUE,
  "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS account (
  id TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "accountId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "idToken" TEXT,
  "accessTokenExpiresAt" TIMESTAMPTZ,
  "refreshTokenExpiresAt" TIMESTAMPTZ,
  scope TEXT,
  password TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS verification (
  id TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE session ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
ALTER TABLE account ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
ALTER TABLE verification ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;

CREATE INDEX IF NOT EXISTS session_userId_idx ON session ("userId");
CREATE INDEX IF NOT EXISTS account_userId_idx ON account ("userId");
CREATE INDEX IF NOT EXISTS verification_identifier_idx ON verification (identifier);
