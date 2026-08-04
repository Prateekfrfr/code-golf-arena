import { logger as defaultLogger } from '../observability/logger.js';
import { assertAuthRepository } from './authRepository.js';
import crypto from 'node:crypto';
import { createOpaqueSession, digestSessionSecret, hashPassword, verifyPassword } from './credentials.js';
import { AuthenticationError } from './errors.js';
import {
  normalizeEmail,
  validateLoginInput,
  validateOpaqueIdentifier,
  validateProfileInput,
  validateRegistrationInput,
  validateVerificationInput
} from './validators.js';

/** @typedef {import('./authRepository.js').AuthRepository} AuthRepository */
/** @typedef {import('./authRepository.js').AuthUser} AuthUser */

/** @typedef {{ info: (event: string, context?: Record<string, unknown>) => void }} AuthLogger */

/** @param {AuthUser} user @returns {AuthUser} */
const toPublicUser = (user) => ({
  id: user.id,
  email: user.email,
  username: user.username ?? user.email.split('@')[0],
  displayName: user.displayName,
  avatar: user.avatar ?? null,
  provider: user.provider ?? 'credentials',
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

const createVerificationCode = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
/** @param {string} code */
const digestVerificationCode = (code) => crypto.createHash('sha256').update(code, 'utf8').digest('hex');

/**
 * @param {{ repository: AuthRepository, logger?: AuthLogger, sessionTtlMs?: number, verificationCodeTtlMs?: number, bootstrapAdminEmail?: string, mailer: { sendVerificationCode: (input: {email: string, code: string}) => Promise<void> }, now?: () => number }} options
 */
export const createAuthService = (options) => {
  assertAuthRepository(options?.repository);
  const repository = options.repository;
  const logger = options.logger ?? defaultLogger;
  const sessionTtlMs = options.sessionTtlMs ?? 1000 * 60 * 60 * 24 * 30;
  const verificationCodeTtlMs = options.verificationCodeTtlMs ?? 10 * 60_000;
  const mailer = options.mailer;
  const bootstrapAdminEmail = options.bootstrapAdminEmail
    ? normalizeEmail(options.bootstrapAdminEmail)
    : null;
  const now = options.now ?? Date.now;

  return Object.freeze({
    /** @param {unknown} input */
    register: async (input) => {
      const registration = validateRegistrationInput(input);
      const passwordHash = await hashPassword(registration.password);

      const pending = /** @type {{ email: string, code: string }} */ (await repository.transaction(async (transaction) => {
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
        const code = createVerificationCode();
        await transaction.createEmailVerificationCode({
          userId: user.id,
          codeHash: digestVerificationCode(code),
          expiresAt: new Date(now() + verificationCodeTtlMs)
        });
        logger.info('auth.registration.completed', { userId: user.id });
        return { email: user.email, code };
      }));
      if (mailer) await mailer.sendVerificationCode(pending);
      return { verificationRequired: true, email: pending.email };
    },

    /** @param {unknown} input */
    login: async (input) => {
      const login = validateLoginInput(input);
      return repository.transaction(async (transaction) => {
        const user = await authenticatePassword(transaction, login.email, login.password);
        if (!user.emailVerifiedAt) {
          throw new AuthenticationError('Verify your email before signing in.');
        }
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

    /** @param {unknown} input */
    verifyEmail: async (input) => {
      const verification = validateVerificationInput(input);
      return repository.transaction(async (transaction) => {
        const user = await transaction.verifyEmailCode({
          email: verification.email,
          codeHash: digestVerificationCode(verification.code)
        });
        if (!user) throw new AuthenticationError('The verification code is invalid or has expired.');
        const session = createOpaqueSession(sessionTtlMs, now);
        await transaction.createSession({ userId: user.id, secretDigest: session.secretDigest, expiresAt: session.expiresAt });
        logger.info('auth.email.verified', { userId: user.id });
        return { user: toPublicUser(user), sessionSecret: session.secret, expiresAt: session.expiresAt };
      });
    },

    /** @param {unknown} input */
    resendVerification: async (input) => {
      const email = normalizeEmail(/** @type {{ email?: unknown }} */ (input).email);
      const user = await repository.findUserByEmail(email);
      if (!user || user.emailVerifiedAt) return { accepted: true };
      const code = createVerificationCode();
      await repository.createEmailVerificationCode({
        userId: user.id,
        codeHash: digestVerificationCode(code),
        expiresAt: new Date(now() + verificationCodeTtlMs)
      });
      if (mailer) await mailer.sendVerificationCode({ email: user.email, code });
      logger.info('auth.email.verification_resent', { userId: user.id });
      return { accepted: true };
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

    /** @param {unknown} sessionSecret */
    refresh: async (sessionSecret) => {
      const secret = validateOpaqueIdentifier(sessionSecret, 'sessionSecret');
      const currentDigest = digestSessionSecret(secret);
      return repository.transaction(async (transaction) => {
        const user = await transaction.getSessionUser(currentDigest);
        if (!user) throw new AuthenticationError();
        await transaction.revokeSession(currentDigest);
        const session = createOpaqueSession(sessionTtlMs, now);
        await transaction.createSession({
          userId: user.id,
          secretDigest: session.secretDigest,
          expiresAt: session.expiresAt
        });
        logger.info('auth.session.refreshed', { userId: user.id });
        return {
          user: toPublicUser(user),
          sessionSecret: session.secret,
          expiresAt: session.expiresAt
        };
      });
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
