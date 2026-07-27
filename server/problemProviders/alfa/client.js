import {
  AlfaCircuitOpenError,
  AlfaHttp4xxError,
  AlfaHttp5xxError,
  AlfaNetworkError,
  AlfaQueueFullError,
  AlfaSchemaError,
  AlfaTimeoutError
} from './errors.js';

/** @typedef {{ difficulty?: string, tags?: string[], limit?: number, cursor?: string }} AlfaListQuery */
/** @typedef {{ items: Record<string, unknown>[], nextCursor: string | null, total: number | null }} AlfaListResult */
/** @typedef {{ maxRetries?: number, baseDelayMs?: number, maxDelayMs?: number }} RetryOptions */
/** @typedef {{ failureThreshold?: number, cooldownMs?: number }} CircuitBreakerOptions */
/**
 * @typedef {object} AlfaClientOptions
 * @property {string} baseUrl
 * @property {typeof fetch} [fetch]
 * @property {number} [timeoutMs]
 * @property {number} [maxResponseBytes]
 * @property {number} [concurrency]
 * @property {number} [maxQueue]
 * @property {RetryOptions} [retry]
 * @property {CircuitBreakerOptions} [circuitBreaker]
 * @property {() => number} [random]
 * @property {(milliseconds: number) => Promise<void>} [sleep]
 * @property {() => number} [now]
 */

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const DEFAULT_CONCURRENCY = 4;
const DEFAULT_MAX_QUEUE = 100;
const DEFAULT_RETRY = Object.freeze({
  maxRetries: 2,
  baseDelayMs: 100,
  maxDelayMs: 2_000
});
const DEFAULT_CIRCUIT_BREAKER = Object.freeze({
  failureThreshold: 5,
  cooldownMs: 30_000
});
const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** @param {unknown} value @param {string} name @param {number} min @param {number} max @returns {number} */
const readInteger = (value, name, min, max) => {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  ) {
    throw new TypeError(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
};

/** @param {unknown} value @returns {value is Record<string, unknown>} */
const isPlainObject = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

/** @param {unknown} value @param {string} field @returns {Record<string, unknown>} */
const requireSafeObject = (value, field) => {
  if (!isPlainObject(value)) throw new AlfaSchemaError(`${field} must be an object`);
  for (const key of Object.keys(value)) {
    if (DANGEROUS_KEYS.has(key)) {
      throw new AlfaSchemaError(`${field} contains an unsafe key`);
    }
  }
  return value;
};

/** @param {unknown} value @param {string} field @returns {Record<string, unknown>[]} */
const requireSafeObjectArray = (value, field) => {
  if (!Array.isArray(value)) throw new AlfaSchemaError(`${field} must be an array`);
  return value.map((item, index) => requireSafeObject(item, `${field}[${index}]`));
};

/** @param {string} baseUrl */
const normalizeBaseUrl = (baseUrl) => {
  let parsed;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new TypeError('ALFA base URL must be a valid absolute URL');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new TypeError('ALFA base URL must use HTTP or HTTPS');
  }
  if (parsed.username || parsed.password) {
    throw new TypeError('ALFA base URL cannot contain credentials');
  }
  parsed.hash = '';
  parsed.search = '';
  if (!parsed.pathname.endsWith('/')) parsed.pathname = `${parsed.pathname}/`;
  return parsed;
};

/** @param {unknown} value @param {string} field @param {number} maxLength @returns {string} */
const boundedText = (value, field, maxLength) => {
  const normalized = String(value ?? '').trim();
  if (normalized.length > maxLength) {
    throw new TypeError(`${field} exceeds ${maxLength} characters`);
  }
  return normalized;
};

/** @param {unknown} input @returns {AlfaListQuery} */
const normalizeListQuery = (input = {}) => {
  if (!isPlainObject(input)) throw new TypeError('Alfa list query must be an object');
  const difficulty = boundedText(input.difficulty, 'difficulty', 20).toLowerCase();
  const cursor = boundedText(input.cursor, 'cursor', 512);
  const rawTags = input.tags == null ? [] : input.tags;
  if (!Array.isArray(rawTags) || rawTags.length > 30) {
    throw new TypeError('tags must contain at most 30 values');
  }
  const tags = rawTags.map((tag) => boundedText(tag, 'tag', 80).toLowerCase()).filter(Boolean);
  const result = /** @type {AlfaListQuery} */ ({
    ...(difficulty ? { difficulty } : {}),
    ...(tags.length ? { tags } : {}),
    ...(cursor ? { cursor } : {})
  });
  if (input.limit != null) result.limit = readInteger(input.limit, 'limit', 1, 100);
  return result;
};

/** @param {unknown} value @returns {Record<string, unknown>} */
const parseProblemResponse = (value) => {
  const envelope = requireSafeObject(value, 'Alfa problem response');
  const data = isPlainObject(envelope.data) ? envelope.data : null;
  const candidate = Object.hasOwn(envelope, 'problem')
    ? envelope.problem
    : Object.hasOwn(envelope, 'question')
      ? envelope.question
      : data && Object.hasOwn(data, 'question')
        ? data.question
        : data ?? envelope;
  return requireSafeObject(candidate, 'Alfa problem');
};

/** @param {unknown} value @returns {AlfaListResult} */
const parseListResponse = (value) => {
  if (Array.isArray(value)) {
    return { items: requireSafeObjectArray(value, 'Alfa problem list'), nextCursor: null, total: value.length };
  }
  const envelope = requireSafeObject(value, 'Alfa list response');
  const items = requireSafeObjectArray(envelope.items, 'Alfa list response.items');
  const rawNextCursor = envelope.nextCursor;
  if (rawNextCursor != null && typeof rawNextCursor !== 'string') {
    throw new AlfaSchemaError('Alfa list response.nextCursor must be a string or null');
  }
  const rawTotal = envelope.total;
  if (
    rawTotal != null &&
    (typeof rawTotal !== 'number' || !Number.isSafeInteger(rawTotal) || rawTotal < 0)
  ) {
    throw new AlfaSchemaError('Alfa list response.total must be a non-negative integer or null');
  }
  return {
    items,
    nextCursor: rawNextCursor == null ? null : /** @type {string} */ (rawNextCursor),
    total: rawTotal == null ? null : /** @type {number} */ (rawTotal)
  };
};

/** @param {Response} response @param {number} maxResponseBytes */
const readJson = async (response, maxResponseBytes) => {
  const contentLength = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(contentLength) && contentLength > maxResponseBytes) {
    throw new AlfaSchemaError(`Alfa response exceeds ${maxResponseBytes} bytes`);
  }
  const text = await response.text();
  if (Buffer.byteLength(text, 'utf8') > maxResponseBytes) {
    throw new AlfaSchemaError(`Alfa response exceeds ${maxResponseBytes} bytes`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new AlfaSchemaError('Alfa response is not valid JSON');
  }
};

/** @param {unknown} error */
const isRetryable = (error) =>
  error instanceof AlfaNetworkError ||
  error instanceof AlfaTimeoutError ||
  error instanceof AlfaHttp5xxError;

/** @param {unknown} error */
const countsTowardCircuit = (error) => isRetryable(error);

/**
 * Creates a fixed-origin client for the Alfa API. The request URL is never
 * supplied by callers: only a validated slug and fixed query parameters may
 * change per request, preventing SSRF through application inputs.
 *
 * @param {AlfaClientOptions} options
 */
export const createAlfaClient = (options) => {
  if (!isPlainObject(options)) throw new TypeError('Alfa client options are required');
  const baseUrl = normalizeBaseUrl(String(options.baseUrl ?? ''));
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch must be a function');
  const timeoutMs = readInteger(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, 'timeoutMs', 100, 60_000);
  const maxResponseBytes = readInteger(
    options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES,
    'maxResponseBytes',
    1_024,
    10 * 1024 * 1024
  );
  const concurrency = readInteger(options.concurrency ?? DEFAULT_CONCURRENCY, 'concurrency', 1, 32);
  const maxQueue = readInteger(options.maxQueue ?? DEFAULT_MAX_QUEUE, 'maxQueue', 0, 10_000);
  const retryInput = { ...DEFAULT_RETRY, ...(options.retry ?? {}) };
  const retry = Object.freeze({
    maxRetries: readInteger(retryInput.maxRetries, 'retry.maxRetries', 0, 10),
    baseDelayMs: readInteger(retryInput.baseDelayMs, 'retry.baseDelayMs', 0, 30_000),
    maxDelayMs: readInteger(retryInput.maxDelayMs, 'retry.maxDelayMs', 0, 60_000)
  });
  if (retry.maxDelayMs < retry.baseDelayMs) {
    throw new TypeError('retry.maxDelayMs must be at least retry.baseDelayMs');
  }
  const circuitInput = { ...DEFAULT_CIRCUIT_BREAKER, ...(options.circuitBreaker ?? {}) };
  const circuitBreaker = Object.freeze({
    failureThreshold: readInteger(circuitInput.failureThreshold, 'circuitBreaker.failureThreshold', 1, 100),
    cooldownMs: readInteger(circuitInput.cooldownMs, 'circuitBreaker.cooldownMs', 100, 10 * 60_000)
  });
  const random = options.random ?? Math.random;
  if (typeof random !== 'function') throw new TypeError('random must be a function');
  const sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  if (typeof sleep !== 'function') throw new TypeError('sleep must be a function');
  const now = options.now ?? Date.now;
  if (typeof now !== 'function') throw new TypeError('now must be a function');

  /** @type {Array<() => void>} */
  const queue = [];
  let active = 0;
  let consecutiveFailures = 0;
  let circuitOpenUntil = 0;

  const drain = () => {
    while (active < concurrency && queue.length > 0) {
      const next = queue.shift();
      if (next) next();
    }
  };

  /** @template T @param {() => Promise<T>} task @returns {Promise<T>} */
  const enqueue = (task) => new Promise((resolve, reject) => {
    if (queue.length >= maxQueue) {
      reject(new AlfaQueueFullError());
      return;
    }
    queue.push(() => {
      active += 1;
      task().then(resolve, reject).finally(() => {
        active -= 1;
        drain();
      });
    });
    drain();
  });

  /** @param {URL} url */
  const fetchOnce = async (url) => {
    if (url.origin !== baseUrl.origin || !url.pathname.startsWith(baseUrl.pathname)) {
      throw new AlfaNetworkError('Alfa request escaped the configured API origin');
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(url, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: { Accept: 'application/json' }
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new AlfaTimeoutError(`Alfa request timed out after ${timeoutMs}ms`, { cause: error });
      }
      throw new AlfaNetworkError('Alfa network request failed', { cause: error });
    } finally {
      clearTimeout(timeout);
    }
    if (response.url) {
      let responseUrl;
      try {
        responseUrl = new URL(response.url);
      } catch {
        throw new AlfaNetworkError('Alfa returned an invalid response URL');
      }
      if (responseUrl.origin !== baseUrl.origin) {
        throw new AlfaNetworkError('Alfa response escaped the configured API origin');
      }
    }
    if (response.status >= 300 && response.status < 400) {
      throw new AlfaNetworkError('Alfa redirects are not allowed');
    }
    if (response.status >= 400 && response.status < 500) throw new AlfaHttp4xxError(response.status);
    if (response.status >= 500) throw new AlfaHttp5xxError(response.status);
    if (!response.ok) throw new AlfaNetworkError('Alfa returned an invalid HTTP response');
    return readJson(response, maxResponseBytes);
  };

  /** @param {URL} url */
  const request = async (url) => enqueue(async () => {
    const currentTime = now();
    if (currentTime < circuitOpenUntil) {
      throw new AlfaCircuitOpenError(circuitOpenUntil - currentTime);
    }
    /** @type {unknown} */
    let lastError;
    for (let attempt = 0; attempt <= retry.maxRetries; attempt += 1) {
      try {
        const value = await fetchOnce(url);
        consecutiveFailures = 0;
        circuitOpenUntil = 0;
        return value;
      } catch (error) {
        lastError = error;
        if (!isRetryable(error) || attempt === retry.maxRetries) break;
        const cap = Math.min(retry.maxDelayMs, retry.baseDelayMs * (2 ** attempt));
        const jitter = Math.max(0, Math.min(1, Number(random()) || 0));
        await sleep(Math.floor(jitter * cap));
      }
    }
    if (countsTowardCircuit(lastError)) {
      consecutiveFailures += 1;
      if (consecutiveFailures >= circuitBreaker.failureThreshold) {
        circuitOpenUntil = now() + circuitBreaker.cooldownMs;
      }
    }
    throw lastError;
  });

  return Object.freeze({
    /** @param {string} slug */
    async fetchBySlug(slug) {
      const normalizedSlug = boundedText(slug, 'slug', 160).toLowerCase();
      if (!SAFE_SLUG.test(normalizedSlug)) throw new TypeError('slug is invalid');
      const url = new URL('select', baseUrl);
      url.searchParams.set('titleSlug', normalizedSlug);
      return parseProblemResponse(await request(url));
    },

    /** @param {AlfaListQuery} [query] */
    async fetchList(query = {}) {
      const normalized = normalizeListQuery(query);
      const url = new URL('problems', baseUrl);
      if (normalized.difficulty) url.searchParams.set('difficulty', normalized.difficulty);
      for (const tag of normalized.tags ?? []) url.searchParams.append('tag', tag);
      if (normalized.limit != null) url.searchParams.set('limit', String(normalized.limit));
      if (normalized.cursor) url.searchParams.set('cursor', normalized.cursor);
      return parseListResponse(await request(url));
    },

    getState() {
      return Object.freeze({
        active,
        queued: queue.length,
        consecutiveFailures,
        circuitOpenUntil
      });
    }
  });
};
