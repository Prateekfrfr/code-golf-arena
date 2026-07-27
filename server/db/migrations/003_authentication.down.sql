DROP TABLE guest_submission_claims;
DROP TABLE auth_sessions;
DROP INDEX users_email_case_insensitive_unique_idx;

ALTER TABLE users
  DROP CONSTRAINT users_registered_identity_check,
  DROP CONSTRAINT users_email_not_blank,
  DROP CONSTRAINT users_role_check,
  DROP CONSTRAINT users_account_kind_check,
  DROP COLUMN registered_at,
  DROP COLUMN role,
  DROP COLUMN password_hash,
  DROP COLUMN email,
  DROP COLUMN account_kind;
