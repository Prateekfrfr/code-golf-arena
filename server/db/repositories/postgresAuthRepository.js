import crypto from 'node:crypto';
import { DatabaseError, ValidationError } from '../../errors/index.js';

/** @typedef {import('../types.js').Database} Database */
/** @typedef {import('../types.js').Queryable} Queryable */

/** @typedef {{ id: string, email: string, display_name: string | null, role: 'user' | 'admin', created_at: string | Date, registered_at: string | Date }} RegisteredAccountRow */
/** @typedef {RegisteredAccountRow & { password_hash: string }} StoredAccountRow */
/** @typedef {{ id: string, user_id: string, email: string, display_name: string | null, role: 'user' | 'admin', expires_at: string | Date, created_at: string | Date, last_seen_at: string | Date }} ActiveSessionRow */
/** @typedef {{ claim_id: string, submission_count: number | string }} GuestClaimRow */
/** @typedef {{ id: string, email: string, displayName: string, role: 'user' | 'admin', createdAt: number, registeredAt: number }} RegisteredAccount */
/** @typedef {RegisteredAccount & { passwordHash: string }} StoredAccount */
/** @typedef {{ id: string, userId: string, email: string, displayName: string, role: 'user' | 'admin', expiresAt: number, createdAt: number, lastSeenAt: number }} ActiveSession */
/** @typedef {{ id?: string, email: string, passwordHash: string, displayName?: string, role?: 'user' | 'admin', registeredAt?: number | Date }} RegisteredAccountWrite */
/** @typedef {{ id?: string, userId: string, tokenHash?: string, secretDigest?: string, expiresAt: number | Date }} SessionWrite */
/** @typedef {{ guestId: string, userId: string }} GuestClaimWrite */
/** @typedef {{ claimed: boolean, claimId: string | null, submissionCount: number }} GuestClaimResult */
/** @typedef {{
 * transaction: <T>(work: (repository: PostgresAuthRepository) => Promise<T>) => Promise<T>,
 * createRegisteredAccount: (value: RegisteredAccountWrite) => Promise<RegisteredAccount>,
 * findRegisteredAccountByEmail: (email: string) => Promise<RegisteredAccount | null>,
 * getUserById: (userId: string) => Promise<RegisteredAccount | null>,
 * findUserByEmail: (email: string) => Promise<StoredAccount | null>,
 * createRegisteredUser: (value: { email: string, passwordHash: string, displayName: string }) => Promise<RegisteredAccount>,
 * createSession: (value: SessionWrite) => Promise<ActiveSession>,
 * getSessionUser: (sessionDigest: string, now?: number | Date) => Promise<RegisteredAccount | null>,
 * findActiveSessionByTokenHash: (tokenHash: string, now?: number | Date) => Promise<ActiveSession | null>,
 * revokeSession: (sessionDigest: string, revokedAt?: number | Date) => Promise<boolean>,
 * revokeSessionByTokenHash: (tokenHash: string, revokedAt?: number | Date) => Promise<boolean>,
 * claimGuestSubmissions: (value: GuestClaimWrite) => Promise<GuestClaimResult>,
 * updateUserProfile: (value: { userId: string, displayName: string }) => Promise<RegisteredAccount>
 * }} PostgresAuthRepository */

/** @param {unknown} value @param {string} field */
const requiredText = (value, field) => {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) {
    throw new ValidationError(`${field} is required.`, {
      code: 'AUTH_REPOSITORY_INPUT_INVALID'
    });
  }
  return normalized;
};

/** @param {unknown} value */
const normalizeEmail = (value) => requiredText(value, 'Email').toLowerCase();

/** @param {unknown} value */
const normalizeTokenHash = (value) => {
  const hash = requiredText(value, 'Session token hash').toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(hash)) {
    throw new ValidationError('Session token hash is invalid.', {
      code: 'AUTH_SESSION_TOKEN_HASH_INVALID'
    });
  }
  return hash;
};

/** @param {unknown} value @param {string} field */
const validTime = (value, field) => {
  const timestamp = value instanceof Date ? value.getTime() : value ?? Date.now();
  if (typeof timestamp !== 'number' || !Number.isSafeInteger(timestamp) || timestamp <= 0) {
    throw new ValidationError(`${field} must be a valid timestamp.`, {
      code: 'AUTH_REPOSITORY_TIMESTAMP_INVALID'
    });
  }
  return timestamp;
};

/** @param {RegisteredAccountRow} row @returns {RegisteredAccount} */
const toRegisteredAccount = (row) =>
  Object.freeze({
    id: row.id,
    email: row.email,
    displayName: row.display_name ?? row.email,
    role: row.role,
    createdAt: new Date(row.created_at).getTime(),
    registeredAt: new Date(row.registered_at).getTime()
  });

/** @param {StoredAccountRow} row @returns {StoredAccount} */
const toStoredAccount = (row) => Object.freeze({
  ...toRegisteredAccount(row),
  passwordHash: row.password_hash
});

/** @param {ActiveSessionRow} row @returns {ActiveSession} */
const toActiveSession = (row) =>
  Object.freeze({
    id: row.id,
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name ?? row.email,
    role: row.role,
    expiresAt: new Date(row.expires_at).getTime(),
    createdAt: new Date(row.created_at).getTime(),
    lastSeenAt: new Date(row.last_seen_at).getTime()
  });

/**
 * PostgreSQL persistence for registered identities and opaque session records.
 * Callers hash session tokens before passing them here; plaintext tokens are
 * intentionally neither accepted nor returned by this boundary.
 * @param {{database: Database}} options
 * @returns {PostgresAuthRepository}
 */
export const createPostgresAuthRepository = ({ database }) => {
  if (!database?.query || !database?.transaction) {
    throw new DatabaseError('A PostgreSQL database boundary is required.', {
      code: 'DATABASE_REPOSITORY_CONFIGURATION_INVALID',
      expose: true
    });
  }

  /** @param {Queryable} queryable @param {boolean} canBeginTransaction @returns {PostgresAuthRepository} */
  const createScopedRepository = (queryable, canBeginTransaction) => {
    /** @param {RegisteredAccountWrite} value */
    const createRegisteredAccount = async (value) => {
      const email = normalizeEmail(value?.email);
      const passwordHash = requiredText(value?.passwordHash, 'Password hash');
      const displayName = value?.displayName === undefined
        ? email
        : requiredText(value.displayName, 'Display name');
      const role = value?.role ?? 'user';
      if (role !== 'user' && role !== 'admin') {
        throw new ValidationError('Account role is invalid.', { code: 'AUTH_ACCOUNT_ROLE_INVALID' });
      }
      const registeredAt = validTime(value?.registeredAt, 'Registration time');
      /** @type {import('../types.js').QueryResult<RegisteredAccountRow>} */
      const result = await queryable.query(
        `INSERT INTO users (
           id, account_kind, email, password_hash, display_name, role, registered_at, updated_at
         ) VALUES ($1, 'registered', $2, $3, $4, $5, $6::TIMESTAMPTZ, CURRENT_TIMESTAMP)
         ON CONFLICT (lower(email)) WHERE email IS NOT NULL DO NOTHING
         RETURNING id, email, display_name, role, created_at, registered_at`,
        [
          value?.id || crypto.randomUUID(),
          email,
          passwordHash,
          displayName,
          role,
          new Date(registeredAt).toISOString()
        ]
      );
      if (!result.rows[0]) {
        throw new ValidationError('An account with that email already exists.', {
          code: 'AUTH_EMAIL_ALREADY_REGISTERED'
        });
      }
      return toRegisteredAccount(result.rows[0]);
    };

    /** @param {string} email */
    const findRegisteredAccountByEmail = async (email) => {
      /** @type {import('../types.js').QueryResult<RegisteredAccountRow>} */
      const result = await queryable.query(
        `SELECT id, email, display_name, role, created_at, registered_at
         FROM users WHERE account_kind = 'registered' AND lower(email) = $1`,
        [normalizeEmail(email)]
      );
      return result.rows[0] ? toRegisteredAccount(result.rows[0]) : null;
    };

    /** @param {string} email */
    const findUserByEmail = async (email) => {
      /** @type {import('../types.js').QueryResult<StoredAccountRow>} */
      const result = await queryable.query(
        `SELECT id, email, display_name, role, password_hash, created_at, registered_at
         FROM users WHERE account_kind = 'registered' AND lower(email) = $1`,
        [normalizeEmail(email)]
      );
      return result.rows[0] ? toStoredAccount(result.rows[0]) : null;
    };

    /** @param {string} userId */
    const getUserById = async (userId) => {
      /** @type {import('../types.js').QueryResult<RegisteredAccountRow>} */
      const result = await queryable.query(
        `SELECT id, email, display_name, role, created_at, registered_at
         FROM users WHERE id = $1 AND account_kind = 'registered'`,
        [requiredText(userId, 'User id')]
      );
      return result.rows[0] ? toRegisteredAccount(result.rows[0]) : null;
    };

    /** @param {{ email: string, passwordHash: string, displayName: string }} value */
    const createRegisteredUser = (value) => createRegisteredAccount(value);

    /** @param {SessionWrite} value */
    const createSession = async (value) => {
      const expiresAt = validTime(value?.expiresAt, 'Session expiry');
      if (expiresAt <= Date.now()) {
        throw new ValidationError('Session expiry must be in the future.', {
          code: 'AUTH_SESSION_EXPIRY_INVALID'
        });
      }
      const secretDigest = value?.secretDigest ?? value?.tokenHash;
      /** @type {import('../types.js').QueryResult<ActiveSessionRow>} */
      const result = await queryable.query(
        `INSERT INTO auth_sessions (id, user_id, token_hash, expires_at)
         SELECT $1, account.id, $2, $3::TIMESTAMPTZ
         FROM users AS account
         WHERE account.id = $4 AND account.account_kind = 'registered'
         RETURNING id, user_id,
           (SELECT email FROM users WHERE id = user_id) AS email,
           (SELECT display_name FROM users WHERE id = user_id) AS display_name,
           (SELECT role FROM users WHERE id = user_id) AS role,
           expires_at, created_at, last_seen_at`,
        [
          value?.id || crypto.randomUUID(),
          normalizeTokenHash(secretDigest),
          new Date(expiresAt).toISOString(),
          requiredText(value?.userId, 'User id')
        ]
      );
      if (!result.rows[0]) {
        throw new ValidationError('Registered account was not found.', {
          code: 'AUTH_SESSION_ACCOUNT_NOT_FOUND'
        });
      }
      return toActiveSession(result.rows[0]);
    };

    /** @param {string} tokenHash @param {number | Date} [now] */
    const findActiveSessionByTokenHash = async (tokenHash, now = Date.now()) => {
      const currentTime = validTime(now, 'Current time');
      /** @type {import('../types.js').QueryResult<ActiveSessionRow>} */
      const result = await queryable.query(
        `UPDATE auth_sessions AS session
         SET last_seen_at = CURRENT_TIMESTAMP
         FROM users AS account
         WHERE session.user_id = account.id
           AND session.token_hash = $1
           AND session.revoked_at IS NULL
           AND session.expires_at > $2::TIMESTAMPTZ
           AND account.account_kind = 'registered'
         RETURNING session.id, session.user_id, account.email, account.display_name, account.role,
                   session.expires_at, session.created_at, session.last_seen_at`,
        [normalizeTokenHash(tokenHash), new Date(currentTime).toISOString()]
      );
      return result.rows[0] ? toActiveSession(result.rows[0]) : null;
    };

    /** @param {string} sessionDigest @param {number | Date} [now] */
    const getSessionUser = async (sessionDigest, now = Date.now()) => {
      const currentTime = validTime(now, 'Current time');
      /** @type {import('../types.js').QueryResult<RegisteredAccountRow>} */
      const result = await queryable.query(
        `UPDATE auth_sessions AS session
         SET last_seen_at = CURRENT_TIMESTAMP
         FROM users AS account
         WHERE session.user_id = account.id
           AND session.token_hash = $1
           AND session.revoked_at IS NULL
           AND session.expires_at > $2::TIMESTAMPTZ
           AND account.account_kind = 'registered'
         RETURNING account.id, account.email, account.display_name, account.role,
                   account.created_at, account.registered_at`,
        [normalizeTokenHash(sessionDigest), new Date(currentTime).toISOString()]
      );
      return result.rows[0] ? toRegisteredAccount(result.rows[0]) : null;
    };

    /** @param {string} tokenHash @param {number | Date} [revokedAt] */
    const revokeSessionByTokenHash = async (tokenHash, revokedAt = Date.now()) => {
      const result = await queryable.query(
        `UPDATE auth_sessions
         SET revoked_at = $2::TIMESTAMPTZ
         WHERE token_hash = $1 AND revoked_at IS NULL
         RETURNING id`,
        [normalizeTokenHash(tokenHash), new Date(validTime(revokedAt, 'Revocation time')).toISOString()]
      );
      return result.rows.length > 0;
    };

    /** @param {string} sessionDigest @param {number | Date} [revokedAt] */
    const revokeSession = (sessionDigest, revokedAt = Date.now()) =>
      revokeSessionByTokenHash(sessionDigest, revokedAt);

    /** @param {GuestClaimWrite} value */
    const claimGuestSubmissionsWith = async (value) => {
      const guestId = requiredText(value?.guestId, 'Guest id');
      const userId = requiredText(value?.userId, 'Registered user id');
      /** @type {import('../types.js').QueryResult<{id: string}>} */
      const registered = await queryable.query(
        `SELECT id FROM users WHERE id = $1 AND account_kind = 'registered' FOR UPDATE`,
        [userId]
      );
      if (!registered.rows[0]) {
        throw new ValidationError('Registered account was not found.', {
          code: 'AUTH_GUEST_CLAIM_ACCOUNT_NOT_FOUND'
        });
      }
      /** @type {import('../types.js').QueryResult<{id: string}>} */
      const guest = await queryable.query(
        `SELECT id FROM users WHERE guest_id = $1 AND account_kind = 'guest' FOR UPDATE`,
        [guestId]
      );
      if (!guest.rows[0]) {
        return Object.freeze({ claimed: false, claimId: null, submissionCount: 0 });
      }
      /** @type {import('../types.js').QueryResult<GuestClaimRow>} */
      const claim = await queryable.query(
        `WITH inserted_claim AS (
           INSERT INTO guest_submission_claims (id, guest_user_id, claimed_by_user_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (guest_user_id) DO NOTHING
           RETURNING id
         ), moved_submissions AS (
           UPDATE submissions SET user_id = $3
           WHERE user_id = $2 AND EXISTS (SELECT 1 FROM inserted_claim)
           RETURNING id
         )
         SELECT inserted_claim.id AS claim_id,
                (SELECT count(*)::INTEGER FROM moved_submissions) AS submission_count
         FROM inserted_claim`,
        [crypto.randomUUID(), guest.rows[0].id, registered.rows[0].id]
      );
      const result = claim.rows[0];
      return Object.freeze({
        claimed: Boolean(result),
        claimId: result?.claim_id ?? null,
        submissionCount: result ? Number(result.submission_count) : 0
      });
    };

    /** @param {GuestClaimWrite} value */
    const claimGuestSubmissions = (value) =>
      canBeginTransaction
        ? database.transaction((transaction) =>
            createScopedRepository(transaction, false).claimGuestSubmissions(value)
          )
        : claimGuestSubmissionsWith(value);

    /** @param {{ userId: string, displayName: string }} value */
    const updateUserProfile = async (value) => {
      /** @type {import('../types.js').QueryResult<RegisteredAccountRow>} */
      const result = await queryable.query(
        `UPDATE users SET display_name = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND account_kind = 'registered'
         RETURNING id, email, display_name, role, created_at, registered_at`,
        [requiredText(value?.userId, 'User id'), requiredText(value?.displayName, 'Display name')]
      );
      if (!result.rows[0]) {
        throw new ValidationError('Registered account was not found.', {
          code: 'AUTH_PROFILE_ACCOUNT_NOT_FOUND'
        });
      }
      return toRegisteredAccount(result.rows[0]);
    };

    /** @type {PostgresAuthRepository} */
    const repository = {
      async transaction(work) {
        if (!canBeginTransaction) return work(repository);
        return database.transaction((transaction) => work(createScopedRepository(transaction, false)));
      },
      createRegisteredAccount,
      findRegisteredAccountByEmail,
      getUserById,
      findUserByEmail,
      createRegisteredUser,
      createSession,
      getSessionUser,
      findActiveSessionByTokenHash,
      revokeSession,
      revokeSessionByTokenHash,
      claimGuestSubmissions,
      updateUserProfile
    };
    return Object.freeze(repository);
  };

  return createScopedRepository(database, true);
};
