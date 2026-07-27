import { AppError } from '../errors/index.js';

/**
 * An authentication failure deliberately has a generic, public message so
 * callers cannot distinguish a missing account from an incorrect password.
 */
export class AuthenticationError extends AppError {
  /** @param {string} [message] */
  constructor(message = 'Authentication failed.') {
    super(message, {
      code: 'AUTHENTICATION_FAILED',
      statusCode: 401,
      expose: true
    });
    this.name = 'AuthenticationError';
  }
}
