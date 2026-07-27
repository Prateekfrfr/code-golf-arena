/**
 * @typedef {object} AppErrorOptions
 * @property {string} [code]
 * @property {number} [statusCode]
 * @property {unknown} [cause]
 * @property {unknown} [details]
 * @property {boolean} [expose]
 */

/**
 * Base error for expected application failures at service boundaries.
 * Details deliberately remain off the wire and out of structured logs.
 */
export class AppError extends Error {
  /**
   * @param {string} message
   * @param {AppErrorOptions} [options]
   */
  constructor(message, options = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'AppError';
    this.code = options.code ?? 'APP_ERROR';
    this.statusCode = options.statusCode ?? 500;
    this.details = options.details;
    this.expose = options.expose ?? false;
  }
}

export class ValidationError extends AppError {
  /** @param {string} message @param {AppErrorOptions} [options] */
  constructor(message, options = {}) {
    super(message, {
      ...options,
      code: options.code ?? 'VALIDATION_ERROR',
      statusCode: options.statusCode ?? 400,
      expose: options.expose ?? true
    });
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends AppError {
  /** @param {string} message @param {AppErrorOptions} [options] */
  constructor(message, options = {}) {
    super(message, {
      ...options,
      code: options.code ?? 'NOT_FOUND',
      statusCode: options.statusCode ?? 404,
      expose: options.expose ?? true
    });
    this.name = 'NotFoundError';
  }
}

export class UpstreamError extends AppError {
  /** @param {string} message @param {AppErrorOptions} [options] */
  constructor(message, options = {}) {
    super(message, {
      ...options,
      code: options.code ?? 'UPSTREAM_FAILURE',
      statusCode: options.statusCode ?? 502,
      expose: options.expose ?? false
    });
    this.name = 'UpstreamError';
  }
}

export class DatabaseError extends AppError {
  /** @param {string} message @param {AppErrorOptions} [options] */
  constructor(message, options = {}) {
    super(message, {
      ...options,
      code: options.code ?? 'DATABASE_FAILURE',
      statusCode: options.statusCode ?? 503,
      expose: options.expose ?? false
    });
    this.name = 'DatabaseError';
  }
}
