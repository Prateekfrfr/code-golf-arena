DROP TABLE IF EXISTS problem_tags;
DROP TABLE IF EXISTS tags;

ALTER TABLE submissions
  DROP CONSTRAINT IF EXISTS submissions_problem_version_fk,
  DROP COLUMN IF EXISTS problem_version;

DROP TABLE IF EXISTS problem_drafts;
DROP INDEX IF EXISTS problems_public_catalog_idx;
DROP INDEX IF EXISTS problems_author_status_idx;

ALTER TABLE problems
  DROP CONSTRAINT IF EXISTS problems_difficulty_check,
  DROP CONSTRAINT IF EXISTS problems_visibility_check,
  DROP CONSTRAINT IF EXISTS problems_status_check,
  DROP COLUMN IF EXISTS deleted_at,
  DROP COLUMN IF EXISTS visibility,
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS author_id;

UPDATE problems SET difficulty = 'hard' WHERE difficulty = 'very-hard';

ALTER TABLE problems
  ADD CONSTRAINT problems_difficulty_check
    CHECK (difficulty IN ('easy', 'medium', 'hard'));

DROP INDEX IF EXISTS users_username_case_insensitive_unique_idx;

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_registered_username_check,
  DROP CONSTRAINT IF EXISTS users_username_format_check,
  DROP CONSTRAINT IF EXISTS users_provider_check,
  DROP CONSTRAINT IF EXISTS users_role_check,
  DROP COLUMN IF EXISTS provider,
  DROP COLUMN IF EXISTS avatar_url,
  DROP COLUMN IF EXISTS username;

UPDATE users SET role = 'user' WHERE role IN ('problem_setter', 'moderator');

ALTER TABLE users
  ADD CONSTRAINT users_role_check CHECK (role IN ('user', 'admin'));
