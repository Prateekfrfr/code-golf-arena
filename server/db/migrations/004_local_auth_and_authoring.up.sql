ALTER TABLE users
  DROP CONSTRAINT users_role_check,
  ADD COLUMN username VARCHAR(80),
  ADD COLUMN avatar_url TEXT,
  ADD COLUMN provider VARCHAR(24) NOT NULL DEFAULT 'credentials';

ALTER TABLE users
  ADD CONSTRAINT users_role_check
    CHECK (role IN ('user', 'problem_setter', 'moderator', 'admin')),
  ADD CONSTRAINT users_provider_check
    CHECK (provider IN ('credentials')),
  ADD CONSTRAINT users_username_format_check
    CHECK (username IS NULL OR username ~ '^[a-z0-9][a-z0-9_-]{1,79}$');

WITH candidates AS (
  SELECT
    id,
    COALESCE(
      NULLIF(
        trim(BOTH '-' FROM regexp_replace(lower(split_part(email, '@', 1)), '[^a-z0-9_-]+', '-', 'g')),
        ''
      ),
      'player'
    ) AS base_name
  FROM users
  WHERE account_kind = 'registered'
)
UPDATE users AS account
SET username = left(candidates.base_name, 40) || '-' || replace(account.id::TEXT, '-', '')
FROM candidates
WHERE account.id = candidates.id;

ALTER TABLE users
  ADD CONSTRAINT users_registered_username_check
    CHECK (
      (account_kind = 'guest' AND username IS NULL)
      OR (account_kind = 'registered' AND username IS NOT NULL)
    );

CREATE UNIQUE INDEX users_username_case_insensitive_unique_idx
  ON users (lower(username))
  WHERE username IS NOT NULL;

ALTER TABLE problems
  DROP CONSTRAINT problems_difficulty_check,
  ADD COLUMN author_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN status VARCHAR(16) NOT NULL DEFAULT 'published',
  ADD COLUMN visibility VARCHAR(16) NOT NULL DEFAULT 'public',
  ADD COLUMN deleted_at TIMESTAMPTZ,
  ADD CONSTRAINT problems_status_check
    CHECK (status IN ('draft', 'published', 'archived')),
  ADD CONSTRAINT problems_visibility_check
    CHECK (visibility IN ('public', 'private', 'unlisted')),
  ADD CONSTRAINT problems_difficulty_check
    CHECK (difficulty IN ('easy', 'medium', 'hard', 'very-hard'));

CREATE INDEX problems_author_status_idx
  ON problems (author_id, status, updated_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX problems_public_catalog_idx
  ON problems (status, visibility, slug)
  WHERE archived_at IS NULL AND deleted_at IS NULL;

CREATE TABLE problem_drafts (
  id UUID PRIMARY KEY,
  problem_id UUID REFERENCES problems(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug VARCHAR(160) NOT NULL,
  draft JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT problem_drafts_document_object CHECK (jsonb_typeof(draft) = 'object'),
  CONSTRAINT problem_drafts_author_slug_unique UNIQUE (author_id, slug)
);

CREATE INDEX problem_drafts_author_updated_idx
  ON problem_drafts (author_id, updated_at DESC);

ALTER TABLE submissions
  ADD COLUMN problem_version INTEGER;

UPDATE submissions AS submission
SET problem_version = problem.current_version
FROM problems AS problem
WHERE problem.id = submission.problem_id;

ALTER TABLE submissions
  ALTER COLUMN problem_version SET NOT NULL,
  ADD CONSTRAINT submissions_problem_version_fk
    FOREIGN KEY (problem_id, problem_version)
    REFERENCES problem_versions(problem_id, version)
    ON DELETE RESTRICT;

CREATE TABLE tags (
  id UUID PRIMARY KEY,
  slug VARCHAR(80) NOT NULL UNIQUE,
  label VARCHAR(80) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT tags_slug_format CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

CREATE TABLE problem_tags (
  problem_id UUID NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE RESTRICT,
  PRIMARY KEY (problem_id, tag_id)
);
