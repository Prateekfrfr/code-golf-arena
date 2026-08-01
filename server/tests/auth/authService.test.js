import assert from 'node:assert/strict';
import test from 'node:test';
import { createAuthService } from '../../auth/authService.js';
import {
  createOpaqueSession,
  digestSessionSecret,
  hashPassword,
  verifyPassword
} from '../../auth/credentials.js';
import { AuthenticationError } from '../../auth/errors.js';
import {
  validateLoginInput,
  validateProfileInput,
  validateRegistrationInput
} from '../../auth/validators.js';
import { ValidationError } from '../../errors/index.js';

const validRegistration = Object.freeze({
  email: 'Player@Example.test',
  password: 'correct horse battery staple',
  displayName: 'Player One',
  guestId: 'guest_123'
});

const createRepository = () => {
  /** @type {Map<string, { id: string, email: string, displayName: string, passwordHash: string }>} */
  const users = new Map();
  /** @type {Map<string, string>} */
  const sessions = new Map();
  const claims = [];
  const calls = { transactions: 0, revoked: [] };
  const repository = {
    calls,
    claims,
    async transaction(work) {
      calls.transactions += 1;
      return work(repository);
    },
    async findUserByEmail(email) {
      return users.get(email) ?? null;
    },
    async createRegisteredUser(input) {
      const user = {
        id: `user_${users.size + 1}`,
        email: input.email,
        displayName: input.displayName,
        passwordHash: input.passwordHash
      };
      users.set(user.email, user);
      return user;
    },
    async createSession(input) {
      sessions.set(input.secretDigest, input.userId);
    },
    async getSessionUser(secretDigest) {
      const userId = sessions.get(secretDigest);
      if (!userId) return null;
      return [...users.values()].find((user) => user.id === userId) ?? null;
    },
    async revokeSession(secretDigest) {
      calls.revoked.push(secretDigest);
      sessions.delete(secretDigest);
    },
    async claimGuestSubmissions(input) {
      claims.push(input);
    },
    async updateUserProfile(input) {
      const user = [...users.values()].find((entry) => entry.id === input.userId);
      if (!user) throw new Error('test user does not exist');
      user.displayName = input.displayName;
      return user;
    },
    async createEmailVerificationCode() {},
    async verifyEmailCode({ email }) {
      const user = users.get(email);
      if (!user) return null;
      user.emailVerifiedAt = Date.now();
      return user;
    }
  };
  return repository;
};

test('passwords use unique scrypt salts and timing-safe verification', async () => {
  const firstHash = await hashPassword(validRegistration.password);
  const secondHash = await hashPassword(validRegistration.password);
  assert.notEqual(firstHash, secondHash);
  assert.equal(await verifyPassword(validRegistration.password, firstHash), true);
  assert.equal(await verifyPassword('not the password', firstHash), false);
  assert.equal(await verifyPassword(validRegistration.password, 'not-a-password-hash'), false);
});

test('opaque sessions store only a SHA-256 digest and respect injected time', () => {
  const session = createOpaqueSession(60_000, () => 1_700_000_000_000);
  assert.match(session.secret, /^[A-Za-z0-9_-]{40,}$/);
  assert.equal(session.secretDigest, digestSessionSecret(session.secret));
  assert.notEqual(session.secretDigest, session.secret);
  assert.equal(session.expiresAt.toISOString(), '2023-11-14T22:14:20.000Z');
});

test('auth validators normalize a small allowlisted profile and reject invalid credentials', () => {
  assert.deepEqual(validateRegistrationInput(validRegistration), {
    email: 'player@example.test',
    password: validRegistration.password,
    displayName: 'Player One',
    guestId: 'guest_123'
  });
  assert.deepEqual(validateLoginInput({
    email: 'PLAYER@example.test',
    password: validRegistration.password
  }), {
    email: 'player@example.test',
    password: validRegistration.password
  });
  assert.deepEqual(validateProfileInput({ displayName: 'Renamed Player' }), {
    displayName: 'Renamed Player'
  });
  assert.throws(
    () => validateRegistrationInput({ ...validRegistration, password: 'too-short' }),
    (error) => error instanceof ValidationError && error.code === 'WEAK_PASSWORD'
  );
  assert.throws(
    () => validateProfileInput({ displayName: 'evil<script>' }),
    (error) => error instanceof ValidationError
  );
});

test('registration atomically creates an account, claims guest work, and returns an unlogged opaque secret', async () => {
  const repository = createRepository();
  const entries = [];
  const service = createAuthService({
    repository,
    logger: { info: (event, context = {}) => entries.push({ event, context }) },
    now: () => 1_700_000_000_000,
    mailer: { sendVerificationCode: async () => {} }
  });

  const registered = await service.register(validRegistration);
  assert.equal(registered.email, 'player@example.test');
  assert.equal(registered.verificationRequired, true);
  assert.equal(repository.calls.transactions, 1);
  assert.deepEqual(repository.claims, [{ guestId: 'guest_123', userId: 'user_1' }]);
  assert.equal(entries[0].event, 'auth.registration.completed');
  assert.equal(JSON.stringify(entries).includes(validRegistration.password), false);
});

test('login uses generic authentication errors and logout revokes by digest', async () => {
  const repository = createRepository();
  const service = createAuthService({ repository, logger: { info: () => {} }, mailer: { sendVerificationCode: async () => {} } });
  await service.register({ ...validRegistration, guestId: null });
  await service.verifyEmail({ email: validRegistration.email, code: '000000' });

  await assert.rejects(
    service.login({ email: validRegistration.email, password: 'wrong password but long enough' }),
    (error) => error instanceof AuthenticationError && error.code === 'AUTHENTICATION_FAILED'
  );
  await assert.rejects(
    service.login({ email: 'missing@example.test', password: validRegistration.password }),
    (error) => error instanceof AuthenticationError && error.message === 'Authentication failed.'
  );

  const loggedIn = await service.login({
    email: validRegistration.email,
    password: validRegistration.password
  });
  await service.logout(loggedIn.sessionSecret);
  assert.deepEqual(repository.calls.revoked, [digestSessionSecret(loggedIn.sessionSecret)]);
  await assert.rejects(service.getSessionUser(loggedIn.sessionSecret), AuthenticationError);
});

test('profile updates require a trusted opaque user id and return a public user', async () => {
  const repository = createRepository();
  const service = createAuthService({ repository, logger: { info: () => {} }, mailer: { sendVerificationCode: async () => {} } });
  const registered = await service.register({ ...validRegistration, guestId: null });
  const updated = await service.updateProfile('user_1', { displayName: 'Updated Name' });
  assert.equal(updated.displayName, 'Updated Name');
  await assert.rejects(
    service.updateProfile('bad id!', { displayName: 'Updated Name' }),
    ValidationError
  );
});
