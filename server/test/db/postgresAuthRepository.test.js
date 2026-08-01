import assert from 'node:assert/strict';
import test from 'node:test';
import { ValidationError } from '../../errors/index.js';
import { createAuthService } from '../../auth/authService.js';
import { createPostgresAuthRepository } from '../../db/repositories/postgresAuthRepository.js';

const ids = Object.freeze({
  account: 'd75de7f8-0fe9-4f7b-b880-536482eefd77',
  guest: '4c4f97b8-4916-41fa-bae4-7bb5b7857f1b',
  session: 'ae647705-e50a-473d-9b66-f81f302857e5',
  claim: '105b4c69-5f0a-4fd1-90ef-0a1da5c2c908'
});
const sessionHash = 'a'.repeat(64);

/** @param {{query: (text: string, values?: unknown[]) => Promise<{rows: Record<string, unknown>[]}>}} transaction */
const databaseWith = (transaction) => ({
  query: transaction.query,
  async transaction(work) {
    return work(transaction);
  }
});

test('auth repository creates case-insensitive unique registered accounts with parameterized values', async () => {
  const calls = [];
  const database = databaseWith({
    async query(text, values = []) {
      calls.push({ text, values });
      return {
        rows: [{
          id: ids.account,
          email: 'member@example.com',
          role: 'user',
          created_at: '2026-01-01T00:00:00.000Z',
          registered_at: '2026-01-01T00:00:00.000Z'
        }]
      };
    }
  });
  const repository = createPostgresAuthRepository({ database });
  const account = await repository.createRegisteredAccount({
    id: ids.account,
    email: ' Member@Example.com ',
    passwordHash: '$argon2id$not-a-real-hash',
    registeredAt: Date.UTC(2026, 0, 1)
  });

  assert.equal(account.email, 'member@example.com');
  assert.match(calls[0].text, /ON CONFLICT \(lower\(email\)\)/);
  assert.equal(calls[0].text.includes('Member@Example'), false);
  assert.deepEqual(calls[0].values.slice(0, 5), [
    ids.account,
    'member@example.com',
    '$argon2id$not-a-real-hash',
    'member@example.com',
    'user'
  ]);
});

test('auth repository rejects duplicate email and invalid plaintext-like session hash input', async () => {
  const database = databaseWith({ async query() { return { rows: [] }; } });
  const repository = createPostgresAuthRepository({ database });

  await assert.rejects(
    repository.createRegisteredAccount({ email: 'member@example.com', passwordHash: 'hash' }),
    (error) => error instanceof ValidationError && error.code === 'AUTH_EMAIL_ALREADY_REGISTERED'
  );
  await assert.rejects(
    repository.createSession({
      userId: ids.account,
      tokenHash: 'plaintext-session-token',
      expiresAt: Date.now() + 60_000
    }),
    (error) => error instanceof ValidationError && error.code === 'AUTH_SESSION_TOKEN_HASH_INVALID'
  );
});

test('auth repository reads session users, revokes sessions, and never returns opaque token hashes', async () => {
  const calls = [];
  const database = databaseWith({
    async query(text, values = []) {
      calls.push({ text, values });
      if (text.startsWith('UPDATE auth_sessions AS session')) {
        return {
          rows: [{
            id: ids.account,
            email: 'member@example.com',
            role: 'user',
            created_at: '2026-01-01T00:00:00.000Z',
            registered_at: '2026-01-01T00:00:00.000Z'
          }]
        };
      }
      return { rows: [{ id: ids.session }] };
    }
  });
  const repository = createPostgresAuthRepository({ database });
  const session = await repository.getSessionUser(sessionHash, Date.UTC(2026, 0, 1, 0, 30));
  const revoked = await repository.revokeSessionByTokenHash(sessionHash, Date.UTC(2026, 0, 1, 1));

  assert.equal(session.id, ids.account);
  assert.equal('tokenHash' in session, false);
  assert.equal(revoked, true);
  assert.match(calls[0].text, /session\.token_hash = \$1/);
  assert.equal(calls[0].text.includes(sessionHash), false);
  assert.equal(calls[0].values[0], sessionHash);
  assert.match(calls[1].text, /revoked_at/);
});

test('guest submission claiming locks identities and moves submissions in one transaction', async () => {
  const calls = [];
  let transactionCount = 0;
  const transaction = {
    async query(text, values = []) {
      calls.push({ text, values });
      if (text.includes("account_kind = 'registered'")) return { rows: [{ id: ids.account }] };
      if (text.includes("account_kind = 'guest'")) return { rows: [{ id: ids.guest }] };
      return { rows: [{ claim_id: ids.claim, submission_count: 3 }] };
    }
  };
  const database = {
    ...databaseWith(transaction),
    async transaction(work) {
      transactionCount += 1;
      return work(transaction);
    }
  };
  const repository = createPostgresAuthRepository({ database });
  const result = await repository.claimGuestSubmissions({
    guestId: "guest-1'; DELETE FROM submissions; --",
    userId: ids.account
  });

  assert.equal(transactionCount, 1);
  assert.deepEqual(result, { claimed: true, claimId: ids.claim, submissionCount: 3 });
  assert.match(calls[0].text, /FOR UPDATE/);
  assert.match(calls[1].text, /FOR UPDATE/);
  assert.match(calls[2].text, /UPDATE submissions/);
  assert.equal(calls[1].text.includes('DELETE FROM submissions'), false);
  assert.equal(calls[1].values[0], "guest-1'; DELETE FROM submissions; --");
  assert.match(calls[2].text, /ON CONFLICT \(guest_user_id\) DO NOTHING/);
});

test('PostgreSQL auth repository satisfies the service contract within one scoped transaction', async () => {
  const calls = [];
  let transactions = 0;
  const transaction = {
    async query(text, values = []) {
      calls.push({ text, values });
      if (text.includes('password_hash') && text.startsWith('SELECT')) return { rows: [] };
      if (text.includes('INSERT INTO users')) {
        return {
          rows: [{
            id: ids.account,
            email: 'member@example.com',
            username: 'member-one',
            display_name: 'Member One',
            avatar_url: null,
            provider: 'credentials',
            role: 'user',
            created_at: '2026-01-01T00:00:00.000Z',
            registered_at: '2026-01-01T00:00:00.000Z'
          }]
        };
      }
      if (text.includes('email_verification_codes')) return { rows: [] };
      if (text.includes("account_kind = 'registered'")) return { rows: [{ id: ids.account }] };
      if (text.includes("account_kind = 'guest'")) return { rows: [] };
      if (text.startsWith('INSERT INTO auth_sessions')) {
        return {
          rows: [{
            id: ids.session,
            user_id: ids.account,
            email: 'member@example.com',
            username: 'member-one',
            display_name: 'Member One',
            avatar_url: null,
            provider: 'credentials',
            role: 'user',
            expires_at: '2099-01-01T00:00:00.000Z',
            created_at: '2026-01-01T00:00:00.000Z',
            last_seen_at: '2026-01-01T00:00:00.000Z'
          }]
        };
      }
      throw new Error(`Unexpected SQL: ${text}`);
    }
  };
  const database = {
    async query() {
      throw new Error('Service transaction unexpectedly used the root database query boundary.');
    },
    async transaction(work) {
      transactions += 1;
      return work(transaction);
    }
  };
  const service = createAuthService({
    repository: createPostgresAuthRepository({ database }),
    logger: { info: () => {} },
    now: () => Date.now(),
    mailer: { sendVerificationCode: async () => {} }
  });
  const registered = await service.register({
    email: 'Member@Example.com',
    password: 'correct horse battery staple',
    displayName: 'Member One',
    guestId: 'guest-1'
  });

  assert.equal(transactions, 1);
  assert.equal(registered.email, 'member@example.com');
  assert.equal(registered.verificationRequired, true);
  assert.equal(calls.some((call) => call.text.includes('email_verification_codes')), true);
});
