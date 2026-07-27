ALTER TABLE problems
  ADD COLUMN provenance_state VARCHAR(40) NOT NULL DEFAULT 'LICENSED',
  ADD COLUMN canonical_url TEXT,
  ADD COLUMN attribution TEXT,
  ADD COLUMN source_data JSONB NOT NULL DEFAULT '{}'::JSONB,
  ADD COLUMN fetched_at TIMESTAMPTZ,
  ADD COLUMN cache_version VARCHAR(80);

ALTER TABLE problems
  ADD CONSTRAINT problems_provenance_state_check
    CHECK (provenance_state IN ('LICENSED', 'RESTRICTED_METADATA_ONLY')),
  ADD CONSTRAINT problems_source_data_object_check
    CHECK (jsonb_typeof(source_data) = 'object'),
  ADD CONSTRAINT problems_restricted_no_hidden_tests_check
    CHECK (
      provenance_state <> 'RESTRICTED_METADATA_ONLY'
      OR COALESCE(jsonb_array_length(current_problem->'hiddenTests'), 0) = 0
    );

CREATE INDEX problems_source_cache_idx
  ON problems (source_key, cache_version, fetched_at DESC)
  WHERE archived_at IS NULL;
