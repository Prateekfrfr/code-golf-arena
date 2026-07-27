import { logger as defaultLogger } from '../observability/logger.js';
import { assertAuthRepository } from './authRepository.js';
import { createOpaqueSession, digestSessionSecret, hashPassword, verifyPassword } from './credentials.js';
import { AuthenticationError } from './errors.js';
import {
  normalizeEmail,
  validateLoginInput,
  validateOpaqueIdentifier,
  validateProfileInput,
  validateRegistrationInput
} from './validators.js';

/** @typedef {import('./authRepository.js').AuthRepository} AuthRepository */
/** @typedef {import('./authRepository.js').AuthUser} AuthUser */

/** @typedef {{ info: (event: string, context?: Record<string, unknown>) => void }} AuthLogger */

/** @param {AuthUser} user @returns {AuthUser} */
const toPublicUser = (user) => ({
  id: user.id,
  email: user.email,
  displayName: user.displayName,
  ...(user.role === undefined ? {} : { role: user.role }),
  ...(user.createdAt === undefined ? {} : { createdAt: user.createdAt })
});

/** @param {AuthRepository} repository @param {string} email @param {string} password */
const authenticatePassword = async (repository, email, password) => {
  const user = await repository.findUserByEmail(email);
  // Execute a comparably expensive scrypt verification when an email is absent.
  // The fixed value is not a credential and is never persisted or logged.
  const passwordHash = user?.passwordHash ?? await hashPassword('invalid-login-placeholder');
  const isValid = await verifyPassword(password, passwordHash);
  if (!user || !isValid) throw new AuthenticationError();
  return user;
};

/**
 * @param {{ repository: AuthRepository, logger?: AuthLogger, sessionTtlMs?: number, bootstrapAdminEmail?: string, now?: () => number }} options
 */
export const createAuthService = (options) => {
  assertAuthRepository(options?.repository);
  const repository = options.repository;
  const logger = options.logger ?? defaultLogger;
  const sessionTtlMs = options.sessionTtlMs ?? 1000 * 60 * 60 * 24 * 30;
  const bootstrapAdminEmail = options.bootstrapAdminEmail
    ? normalizeEmail(options.bootstrapAdminEmail)
    : null;
  const now = options.now ?? Date.now;

  return Object.freeze({
    /** @param {unknown} input */
    register: async (input) => {
      const registration = validateRegistrationInput(input);
      const passwordHash = await hashPassword(registration.password);

      return repository.transaction(async (transaction) => {
        const existing = await transaction.findUserByEmail(registration.email);
        if (existing) {
          throw new AuthenticationError('Unable to register with those credentials.');
        }
        const user = await transaction.createRegisteredUser({
          email: registration.email,
          passwordHash,
          displayName: registration.displayName,
          role: bootstrapAdminEmail === registration.email ? 'admin' : 'user'
        });
        if (registration.guestId) {
          await transaction.claimGuestSubmissions({ guestId: registration.guestId, userId: user.id });
        }
        const session = createOpaqueSession(sessionTtlMs, now);
        await transaction.createSession({
          userId: user.id,
          secretDigest: session.secretDigest,
          expiresAt: session.expiresAt
        });
        logger.info('auth.registration.completed', { userId: user.id });
        return { user: toPublicUser(user), sessionSecret: session.secret, expiresAt: session.expiresAt };
      });
    },

    /** @param {unknown} input */
    login: async (input) => {
      const login = validateLoginInput(input);
      return repository.transaction(async (transaction) => {
        const user = await authenticatePassword(transaction, login.email, login.password);
        const session = createOpaqueSession(sessionTtlMs, now);
        await transaction.createSession({
          userId: user.id,
          secretDigest: session.secretDigest,
          expiresAt: session.expiresAt
        });
        logger.info('auth.login.completed', { userId: user.id });
        return { user: toPublicUser(user), sessionSecret: session.secret, expiresAt: session.expiresAt };
      });
    },

    /** @param {unknown} sessionSecret */
    getSessionUser: async (sessionSecret) => {
      const secret = validateOpaqueIdentifier(sessionSecret, 'sessionSecret');
      const user = await repository.getSessionUser(digestSessionSecret(secret));
      if (!user) throw new AuthenticationError();
      return toPublicUser(user);
    },

    /** @param {unknown} sessionSecret */
    logout: async (sessionSecret) => {
      const secret = validateOpaqueIdentifier(sessionSecret, 'sessionSecret');
      await repository.revokeSession(digestSessionSecret(secret));
    },

    /** @param {unknown} userId @param {unknown} input */
    updateProfile: async (userId, input) => {
      const safeUserId = validateOpaqueIdentifier(userId, 'userId');
      const profile = validateProfileInput(input);
      const user = await repository.updateUserProfile({
        userId: safeUserId,
        displayName: profile.displayName
      });
      logger.info('auth.profile.updated', { userId: user.id });
      return toPublicUser(user);
    }
  });
};
