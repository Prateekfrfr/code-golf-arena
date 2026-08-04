export { createAuthService } from './authService.js';
export { assertAuthRepository } from './authRepository.js';
export { createOpaqueSession, digestSessionSecret, hashPassword, verifyPassword } from './credentials.js';
export { AuthenticationError } from './errors.js';
export {
  normalizeEmail,
  validateLoginInput,
  validateProfileInput,
  validateRegistrationInput,
  validateVerificationInput
} from './validators.js';
