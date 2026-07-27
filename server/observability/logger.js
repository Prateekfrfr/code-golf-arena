import crypto from 'node:crypto';
import { AppError } from '../errors/index.js';

const LEVELS = Object.freeze({ debug: 10, info: 20, warn: 30, error: 40 });
const SENSITIVE_KEY = /(?:authorization|authentication|token|secret|password|passwd|cookie|api[_-]?key|source|statement|content|html|input|output|metadata|code)/i;
const DANGEROUS_KEY = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_STRING_LENGTH = 512;
const MAX_DEPTH = 4;
const MAX_KEYS = 40;

/** @typedef {'debug' | 'info' | 'warn' | 'error'} LogLevel */

/**
 * @typedef {object} LoggerOptions
 * @property {LogLevel} [level]
 * @property {string} [service]
 * @property {(line: string) => void} [write]
 * @property {() => string} [createCorrelationId]
 */

/** @param {unknown} level @returns {LogLevel} */
const normalizeLevel = (level) =>
  typeof level === 'string' && Object.hasOwn(LEVELS, level.toLowerCase())
    ? /** @type {LogLevel} */ (level.toLowerCase())
    : 'info';

/** @param {string} value @returns {string} */
const truncate = (value) =>
  value.length > MAX_STRING_LENGTH
    ? `${value.slice(0, MAX_STRING_LENGTH)}…[truncated]`
    : value;

/** @param {unknown} value @returns {value is Record<string, unknown>} */
const isPlainObject = (value) => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

/**
 * Produces a bounded log-safe view without evaluating getters or retaining
 * submitted source, credentials, cookies, payload content, or error details.
 * @param {unknown} value
 * @param {number} [depth]
 * @returns {unknown}
 */
export const redactForLog = (value, depth = 0) => {
  if (value === null || typeof value === 'boolean' || typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') return truncate(value);
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'undefined') return undefined;
  if (depth >= MAX_DEPTH) return '[truncated]';
  if (Array.isArray(value)) {
    return value.slice(0, MAX_KEYS).map((item) => redactForLog(item, depth + 1));
  }
  if (!isPlainObject(value)) return '[unserializable]';

  const result = Object.create(null);
  for (const key of Object.keys(value).slice(0, MAX_KEYS)) {
    if (DANGEROUS_KEY.has(key)) continue;
    if (SENSITIVE_KEY.test(key)) {
      result[key] = '[redacted]';
      continue;
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
      result[key] = '[redacted]';
      continue;
    }
    const redacted = redactForLog(descriptor.value, depth + 1);
    if (redacted !== undefined) result[key] = redacted;
  }
  return result;
};

/** @param {unknown} error @returns {Record<string, unknown>} */
export const serializeErrorForLog = (error) => {
  if (error instanceof AppError) {
    return {
      name: error.name,
      code: error.code,
      statusCode: error.statusCode
    };
  }
  return { name: 'UnexpectedError' };
};

/** @returns {string} */
export const createCorrelationId = () => crypto.randomUUID();

/** @param {LoggerOptions} [options] */
export const createLogger = (options = {}) => {
  const level = normalizeLevel(options.level ?? process.env.LOG_LEVEL ?? 'info');
  const service = truncate(options.service ?? 'code-golf-arena');
  const write = options.write ?? ((line) => process.stdout.write(`${line}\n`));
  const newCorrelationId = options.createCorrelationId ?? createCorrelationId;

  /**
   * @param {LogLevel} entryLevel
   * @param {string} event
   * @param {Record<string, unknown>} [context]
   */
  const log = (entryLevel, event, context = {}) => {
    if (LEVELS[entryLevel] < LEVELS[level]) return;
    const safeContext = redactForLog(context);
    const safeFields = isPlainObject(safeContext) ? safeContext : {};
    const {
      correlationId: _ignoredCorrelationId,
      error: _ignoredError,
      ...contextFields
    } = safeFields;
    void _ignoredCorrelationId;
    void _ignoredError;
    /** @type {Record<string, unknown>} */
    const serialized = {
      timestamp: new Date().toISOString(),
      level: entryLevel,
      service,
      event: truncate(String(event)),
      correlationId:
        typeof context.correlationId === 'string' && context.correlationId.length <= 128
          ? context.correlationId
          : newCorrelationId(),
      ...contextFields
    };
    if (context.error !== undefined) {
      serialized.error = serializeErrorForLog(context.error);
    }
    write(JSON.stringify(serialized));
  };

  /** @param {string} event @param {Record<string, unknown>} [context] */
  const debug = (event, context) => log('debug', event, context);
  /** @param {string} event @param {Record<string, unknown>} [context] */
  const info = (event, context) => log('info', event, context);
  /** @param {string} event @param {Record<string, unknown>} [context] */
  const warn = (event, context) => log('warn', event, context);
  /** @param {string} event @param {Record<string, unknown>} [context] */
  const error = (event, context) => log('error', event, context);

  return Object.freeze({ debug, info, warn, error });
};

export const logger = createLogger();
