DROP INDEX IF EXISTS problems_source_cache_idx;

ALTER TABLE problems
  DROP CONSTRAINT IF EXISTS problems_restricted_no_hidden_tests_check,
  DROP CONSTRAINT IF EXISTS problems_source_data_object_check,
  DROP CONSTRAINT IF EXISTS problems_provenance_state_check,
  DROP COLUMN IF EXISTS cache_version,
  DROP COLUMN IF EXISTS fetched_at,
  DROP COLUMN IF EXISTS source_data,
  DROP COLUMN IF EXISTS attribution,
  DROP COLUMN IF EXISTS canonical_url,
  DROP COLUMN IF EXISTS provenance_state;
