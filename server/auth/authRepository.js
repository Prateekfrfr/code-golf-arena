/**
 * @typedef {object} AuthUser
 * @property {string} id
 * @property {string} email
 * @property {string} username
 * @property {string} displayName
 * @property {string | null} [avatar]
 * @property {'credentials'} [provider]
 * @property {'user' | 'problem_setter' | 'moderator' | 'admin'} [role]
 * @property {Date | string} [createdAt]
 * @property {number | null} [emailVerifiedAt]
 */

/**
 * @typedef {AuthUser & { passwordHash: string }} StoredAuthUser
 */

/**
 * Contract for the durable auth boundary. Implementations must make
 * `transaction` atomic: creating an account, claiming guest work, and issuing
 * a session either all succeed or all roll back.
 *
 * @typedef {object} AuthRepository
 * @property {<T>(work: (repository: AuthRepository) => Promise<T>) => Promise<T>} transaction
 * @property {(email: string) => Promise<StoredAuthUser | null>} findUserByEmail
 * @property {(input: { email: string, passwordHash: string, displayName: string, role?: 'user' | 'problem_setter' | 'moderator' | 'admin' }) => Promise<AuthUser>} createRegisteredUser
 * @property {(input: { userId: string, secretDigest: string, expiresAt: Date }) => Promise<void>} createSession
 * @property {(secretDigest: string) => Promise<AuthUser | null>} getSessionUser
 * @property {(secretDigest: string) => Promise<void>} revokeSession
 * @property {(input: { guestId: string, userId: string }) => Promise<void>} claimGuestSubmissions
 * @property {(input: { userId: string, displayName: string }) => Promise<AuthUser>} updateUserProfile
 * @property {(input: { userId: string, codeHash: string, expiresAt: Date }) => Promise<void>} createEmailVerificationCode
 * @property {(input: { email: string, codeHash: string }) => Promise<AuthUser | null>} verifyEmailCode
 */

const REQUIRED_METHODS = Object.freeze([
  'transaction',
  'findUserByEmail',
  'createRegisteredUser',
  'createSession',
  'getSessionUser',
  'revokeSession',
  'claimGuestSubmissions',
  'updateUserProfile',
  'createEmailVerificationCode',
  'verifyEmailCode'
]);

/** @param {unknown} value @returns {asserts value is AuthRepository} */
export const assertAuthRepository = (value) => {
  if (value === null || typeof value !== 'object') {
    throw new TypeError('An auth repository is required.');
  }
  for (const method of REQUIRED_METHODS) {
    if (typeof Reflect.get(value, method) !== 'function') {
      throw new TypeError(`Auth repository is missing ${method}().`);
    }
  }
};
