import { UpstreamError } from '../../errors/index.js';

/**
 * Base error for failures while retrieving data from the configured Alfa API.
 * These errors intentionally do not expose upstream response bodies.
 */
export class AlfaError extends UpstreamError {
  /** @param {string} message @param {import('../../errors/appError.js').AppErrorOptions} [options] */
  constructor(message, options = {}) {
    super(message, {
      ...options,
      code: options.code ?? 'ALFA_FAILURE'
    });
    this.name = 'AlfaError';
  }
}

export class AlfaNetworkError extends AlfaError {
  /** @param {string} message @param {import('../../errors/appError.js').AppErrorOptions} [options] */
  constructor(message, options = {}) {
    super(message, { ...options, code: options.code ?? 'ALFA_NETWORK_FAILURE' });
    this.name = 'AlfaNetworkError';
  }
}

export class AlfaTimeoutError extends AlfaError {
  /** @param {string} message @param {import('../../errors/appError.js').AppErrorOptions} [options] */
  constructor(message, options = {}) {
    super(message, {
      ...options,
      code: options.code ?? 'ALFA_TIMEOUT',
      statusCode: options.statusCode ?? 504
    });
    this.name = 'AlfaTimeoutError';
  }
}

export class AlfaHttp4xxError extends AlfaError {
  /** @param {number} status */
  constructor(status) {
    super(`Alfa returned a client error (${status})`, {
      code: 'ALFA_HTTP_4XX',
      details: { status }
    });
    this.name = 'AlfaHttp4xxError';
    this.upstreamStatus = status;
  }
}

export class AlfaHttp5xxError extends AlfaError {
  /** @param {number} status */
  constructor(status) {
    super(`Alfa returned a server error (${status})`, {
      code: 'ALFA_HTTP_5XX',
      details: { status }
    });
    this.name = 'AlfaHttp5xxError';
    this.upstreamStatus = status;
  }
}

export class AlfaSchemaError extends AlfaError {
  /** @param {string} message @param {import('../../errors/appError.js').AppErrorOptions} [options] */
  constructor(message, options = {}) {
    super(message, { ...options, code: options.code ?? 'ALFA_SCHEMA_MISMATCH' });
    this.name = 'AlfaSchemaError';
  }
}

export class AlfaCircuitOpenError extends AlfaError {
  /** @param {number} retryAfterMs */
  constructor(retryAfterMs) {
    super('Alfa circuit breaker is open', {
      code: 'ALFA_CIRCUIT_OPEN',
      details: { retryAfterMs }
    });
    this.name = 'AlfaCircuitOpenError';
    this.retryAfterMs = retryAfterMs;
  }
}

export class AlfaQueueFullError extends AlfaError {
  constructor() {
    super('Alfa request queue is full', { code: 'ALFA_QUEUE_FULL' });
    this.name = 'AlfaQueueFullError';
  }
}
