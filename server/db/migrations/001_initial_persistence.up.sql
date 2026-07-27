CREATE TABLE users (
  id UUID PRIMARY KEY,
  guest_id VARCHAR(64) UNIQUE,
  display_name VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT users_guest_id_not_blank CHECK (guest_id IS NULL OR btrim(guest_id) <> '')
);

CREATE TABLE problems (
  id UUID PRIMARY KEY,
  slug VARCHAR(160) NOT NULL UNIQUE,
  title VARCHAR(200) NOT NULL,
  statement TEXT NOT NULL,
  difficulty VARCHAR(20) NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
  topic VARCHAR(80) NOT NULL,
  tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  supported_languages TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  current_version INTEGER NOT NULL CHECK (current_version > 0),
  current_fingerprint CHAR(64) NOT NULL,
  current_problem JSONB NOT NULL,
  source_key VARCHAR(600) NOT NULL,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT problems_current_problem_object CHECK (jsonb_typeof(current_problem) = 'object')
);

CREATE TABLE problem_versions (
  id UUID PRIMARY KEY,
  problem_id UUID NOT NULL REFERENCES problems(id) ON DELETE RESTRICT,
  version INTEGER NOT NULL CHECK (version > 0),
  fingerprint CHAR(64) NOT NULL,
  source_key VARCHAR(600) NOT NULL,
  source JSONB NOT NULL,
  problem JSONB NOT NULL,
  source_data JSONB NOT NULL DEFAULT '{}'::JSONB,
  imported_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT problem_versions_source_object CHECK (jsonb_typeof(source) = 'object'),
  CONSTRAINT problem_versions_problem_object CHECK (jsonb_typeof(problem) = 'object'),
  CONSTRAINT problem_versions_source_data_object CHECK (jsonb_typeof(source_data) = 'object'),
  CONSTRAINT problem_versions_version_unique UNIQUE (problem_id, version),
  CONSTRAINT problem_versions_fingerprint_unique UNIQUE (problem_id, fingerprint)
);

CREATE TABLE submissions (
  id UUID PRIMARY KEY,
  room_code VARCHAR(12) NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  problem_id UUID NOT NULL REFERENCES problems(id) ON DELETE RESTRICT,
  language VARCHAR(32) NOT NULL,
  status VARCHAR(16) NOT NULL CHECK (status IN ('accepted', 'rejected')),
  source_code TEXT NOT NULL,
  character_count INTEGER NOT NULL CHECK (character_count >= 0),
  character_bytes INTEGER NOT NULL CHECK (character_bytes >= 0),
  code_point_count INTEGER NOT NULL CHECK (code_point_count >= 0),
  runtime_ms NUMERIC(12, 2) NOT NULL CHECK (runtime_ms >= 0),
  memory_bytes BIGINT CHECK (memory_bytes IS NULL OR memory_bytes >= 0),
  compression JSONB,
  compression_score INTEGER CHECK (compression_score IS NULL OR compression_score >= 0),
  submitted_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE submission_scores (
  submission_id UUID PRIMARY KEY REFERENCES submissions(id) ON DELETE CASCADE,
  score BIGINT NOT NULL CHECK (score >= 0),
  max_score BIGINT NOT NULL CHECK (max_score > 0),
  config_version VARCHAR(80) NOT NULL,
  breakdown JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT submission_scores_breakdown_object CHECK (jsonb_typeof(breakdown) = 'object')
);

CREATE TABLE submission_analytics (
  submission_id UUID PRIMARY KEY REFERENCES submissions(id) ON DELETE CASCADE,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT submission_analytics_data_object CHECK (jsonb_typeof(data) = 'object')
);

CREATE INDEX problems_difficulty_slug_idx ON problems (difficulty, slug) WHERE archived_at IS NULL;
CREATE INDEX problems_tags_gin_idx ON problems USING GIN (tags);
CREATE INDEX problems_languages_gin_idx ON problems USING GIN (supported_languages);
CREATE INDEX problems_topic_slug_idx ON problems (topic, slug) WHERE archived_at IS NULL;
CREATE INDEX problem_versions_source_key_idx ON problem_versions (source_key, problem_id);
CREATE INDEX submissions_user_history_idx ON submissions (user_id, submitted_at DESC);
CREATE INDEX submissions_problem_history_idx ON submissions (problem_id, submitted_at DESC);
CREATE INDEX submissions_room_history_idx ON submissions (room_code, submitted_at DESC);
CREATE INDEX submission_scores_leaderboard_idx ON submission_scores (score DESC, submission_id);
