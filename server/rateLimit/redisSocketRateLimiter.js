import { SOCKET_RATE_LIMIT_RULES } from './socketRateLimiter.js';

const MAX_RULES = 32;
const MAX_LIMIT = 100_000;
const MAX_WINDOW_MS = 24 * 60 * 60 * 1_000;
const MAX_IDENTITY_LENGTH = 256;
const MAX_NAMESPACE_LENGTH = 120;
const DEFAULT_NAMESPACE = 'code-golf-arena:socket-rate-limit:v1';
const DEFAULT_UNAVAILABLE_RETRY_AFTER_MS = 1_000;
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const RULE_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/;
const NAMESPACE_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,119}$/;

/**
 * This script deliberately uses a fixed-window counter. INCR and the initial
 * PEXPIRE execute in one Redis operation, so concurrent socket processes
 * cannot create a non-expiring key or accept more requests than the rule.
 */
export const REDIS_SOCKET_RATE_LIMIT_LUA = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
return { count, ttl }
`.trim();

/**
 * @typedef {{ limit: number, windowMs: number }} RateLimitRule
 * @typedef {{ allowed: boolean, retryAfterMs: number, remaining: number, error?: string }} RateLimitResult
 * @typedef {(script: string, options: { keys: string[], arguments: string[] }) => Promise<unknown>} RedisEval
 */

/** @param {unknown} value @returns {value is Record<string, unknown>} */
const isPlainRecord = (value) => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(/** @type {object} */ (value));
  return prototype === Object.prototype || prototype === null;
};

/** @param {unknown} value @param {string} label @param {number} min @param {number} max */
const readBoundedInteger = (value, label, min, max) => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new TypeError(`${label} must be an integer between ${min} and ${max}.`);
  }
  return /** @type {number} */ (value);
};

/** @param {unknown} rules */
const normalizeRules = (rules) => {
  if (!isPlainRecord(rules)) throw new TypeError('Rate-limit rules must be a plain object.');

  const names = Object.keys(rules);
  if (names.length === 0 || names.length > MAX_RULES) {
    throw new RangeError(`Rate-limit rules must contain between 1 and ${MAX_RULES} rules.`);
  }

  const normalized = new Map();
  for (const name of names) {
    if (DANGEROUS_KEYS.has(name) || !RULE_NAME_PATTERN.test(name)) {
      throw new TypeError(`Rate-limit rule name is invalid: ${name}`);
    }

    const descriptor = Object.getOwnPropertyDescriptor(rules, name);
    if (!descriptor || !('value' in descriptor) || !isPlainRecord(descriptor.value)) {
      throw new TypeError(`Rate-limit rule ${name} must be a plain object.`);
    }

    const limit = readBoundedInteger(descriptor.value.limit, `${name}.limit`, 1, MAX_LIMIT);
    const windowMs = readBoundedInteger(descriptor.value.windowMs, `${name}.windowMs`, 1, MAX_WINDOW_MS);
    normalized.set(name, Object.freeze({ limit, windowMs }));
  }
  return normalized;
};

/** @param {unknown} value */
const isSafeRedisResultInteger = (value) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

/**
 * Builds a bounded, namespaced Redis key. Encoding means untrusted socket
 * identities cannot add key separators or Redis glob syntax.
 *
 * @param {string} namespace
 * @param {string} ruleName
 * @param {string} identity
 */
export const buildRedisSocketRateLimitKey = (namespace, ruleName, identity) =>
  `${namespace}:${ruleName}:${encodeURIComponent(identity)}`;

/** @param {unknown} identity */
const isValidIdentity = (identity) =>
  typeof identity === 'string' &&
  identity.length > 0 &&
  identity.length <= MAX_IDENTITY_LENGTH &&
  !/[\u0000-\u001f\u007f]/.test(identity);

/** @param {unknown} result */
const parseScriptResult = (result) => {
  if (!Array.isArray(result) || result.length < 2) return null;
  const count = Number(result[0]);
  const ttl = Number(result[1]);
  if (!isSafeRedisResultInteger(count) || count < 1 || !isSafeRedisResultInteger(ttl)) {
    return null;
  }
  return { count, ttl };
};

/**
 * Creates a distributed socket limiter. The injected `eval` function follows
 * node-redis v4's `eval(script, { keys, arguments })` shape. Other Redis
 * clients can be used through a small adapter passed as `eval`.
 *
 * @param {{
 *   client?: { eval?: RedisEval },
 *   eval?: RedisEval,
 *   rules?: Record<string, RateLimitRule>,
 *   namespace?: string,
 *   unavailableRetryAfterMs?: number,
 *   onError?: (error: unknown) => void
 * }} [options]
 */
export const createRedisSocketRateLimiter = (options = {}) => {
  const rules = normalizeRules(options.rules ?? SOCKET_RATE_LIMIT_RULES);
  const namespace = options.namespace ?? DEFAULT_NAMESPACE;
  if (
    typeof namespace !== 'string' ||
    namespace.length > MAX_NAMESPACE_LENGTH ||
    !NAMESPACE_PATTERN.test(namespace)
  ) {
    throw new TypeError('Rate-limit namespace is invalid.');
  }
  const unavailableRetryAfterMs = readBoundedInteger(
    options.unavailableRetryAfterMs ?? DEFAULT_UNAVAILABLE_RETRY_AFTER_MS,
    'unavailableRetryAfterMs',
    1,
    60_000
  );
  const evalScript = options.eval ?? options.client?.eval?.bind(options.client);
  if (typeof evalScript !== 'function') {
    throw new TypeError('A Redis eval function or client.eval is required.');
  }

  const reject = (/** @type {'invalid_rate_limit_request' | 'rate_limit_unavailable'} */ error) => ({
    allowed: false,
    retryAfterMs: unavailableRetryAfterMs,
    remaining: 0,
    error
  });

  /** @param {string} identity @param {string} ruleName @returns {Promise<RateLimitResult>} */
  const consume = async (identity, ruleName) => {
    if (!isValidIdentity(identity) || typeof ruleName !== 'string') {
      return reject('invalid_rate_limit_request');
    }
    const rule = rules.get(ruleName);
    if (!rule) return reject('invalid_rate_limit_request');

    const key = buildRedisSocketRateLimitKey(namespace, ruleName, identity);
    try {
      const result = parseScriptResult(await evalScript(REDIS_SOCKET_RATE_LIMIT_LUA, {
        keys: [key],
        arguments: [String(rule.windowMs)]
      }));
      if (!result || result.ttl === 0) return reject('rate_limit_unavailable');

      const allowed = result.count <= rule.limit;
      return {
        allowed,
        retryAfterMs: allowed ? 0 : Math.max(1, result.ttl),
        remaining: Math.max(0, rule.limit - result.count)
      };
    } catch (error) {
      try {
        options.onError?.(error);
      } catch {
        // Observability hooks must never affect socket handling.
      }
      return reject('rate_limit_unavailable');
    }
  };

  return Object.freeze({ consume });
};

export const REDIS_SOCKET_RATE_LIMIT_NAMESPACE = DEFAULT_NAMESPACE;
