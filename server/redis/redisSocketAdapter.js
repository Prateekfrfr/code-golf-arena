import { createAdapter as createSocketIoRedisAdapter } from '@socket.io/redis-adapter';
import { createClient as createNodeRedisClient } from 'redis';
import { logger as defaultLogger } from '../observability/logger.js';

const NAMESPACE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,119}$/;
const DEFAULT_NAMESPACE = 'code-golf-arena';

/** @typedef {'idle' | 'connecting' | 'ready' | 'closing' | 'closed'} RedisLifecycleState */

/**
 * The small subset of node-redis used by this boundary. Keeping it structural
 * makes the lifecycle straightforward to test without a live Redis server.
 * @typedef {{
 *   connect: () => Promise<unknown>,
 *   duplicate: () => RedisClient,
 *   quit?: () => Promise<unknown>,
 *   disconnect?: () => void,
 *   on: (event: string, listener: (...args: unknown[]) => void) => unknown,
 *   isOpen?: boolean
 * }} RedisClient
 */

/** @typedef {{ info: (event: string, context?: Record<string, unknown>) => void, warn: (event: string, context?: Record<string, unknown>) => void, error: (event: string, context?: Record<string, unknown>) => void }} RedisLogger */
/** @typedef {(options: { url: string, socket: { reconnectStrategy: (retries: number) => number } }) => RedisClient} RedisClientFactory */
/** @typedef {(publisher: RedisClient, subscriber: RedisClient, options: { key: string, requestsTimeout: number, publishOnSpecificResponseChannel: boolean }) => unknown} SocketIoRedisAdapterFactory */

/**
 * @param {number} value
 * @param {string} name
 * @param {{ min: number, max: number }} bounds
 */
const requireInteger = (value, name, { min, max }) => {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  }
  return value;
};

/**
 * Validate a Redis endpoint without returning a credential-bearing value.
 * `rediss:` enables TLS in node-redis. Plain `redis:` is allowed only when the
 * caller explicitly permits it (normally for an isolated local development
 * network).
 * @param {string} url
 * @param {{ requireTls?: boolean }} [options]
 * @returns {{ protocol: 'redis:' | 'rediss:', hostname: string, port: string }}
 */
export const validateRedisUrl = (url, { requireTls = false } = {}) => {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('REDIS_URL must be a valid redis:// or rediss:// URL.');
  }

  if (parsed.protocol !== 'redis:' && parsed.protocol !== 'rediss:') {
    throw new Error('REDIS_URL must use redis:// or rediss://.');
  }
  if (!parsed.hostname || parsed.hash) {
    throw new Error('REDIS_URL is invalid.');
  }
  if (requireTls && parsed.protocol !== 'rediss:') {
    throw new Error('REDIS_URL must use rediss:// when TLS is required.');
  }

  return {
    protocol: /** @type {'redis:' | 'rediss:'} */ (parsed.protocol),
    hostname: parsed.hostname,
    port: parsed.port
  };
};

/**
 * @param {string | undefined} namespace
 * @returns {string}
 */
export const normalizeRedisNamespace = (namespace = DEFAULT_NAMESPACE) => {
  const value = namespace.trim();
  if (!NAMESPACE_PATTERN.test(value)) {
    throw new Error('REDIS_NAMESPACE must contain only letters, numbers, colon, underscore, or hyphen.');
  }
  return value;
};

/**
 * Bounded exponential backoff with a small positive jitter. It never returns
 * an Error, so transient Redis outages continue reconnecting rather than
 * permanently disabling the realtime process.
 * @param {{ minDelayMs?: number, maxDelayMs?: number, random?: () => number }} [options]
 */
export const createRedisReconnectStrategy = (options = {}) => {
  const minDelayMs = requireInteger(options.minDelayMs ?? 100, 'minDelayMs', {
    min: 10,
    max: 60_000
  });
  const maxDelayMs = requireInteger(options.maxDelayMs ?? 5_000, 'maxDelayMs', {
    min: minDelayMs,
    max: 300_000
  });
  const random = options.random ?? Math.random;

  /** @param {number} retries */
  return (retries) => {
    const safeRetries = Math.max(0, Math.min(30, Number.isSafeInteger(retries) ? retries : 0));
    const baseDelay = Math.min(maxDelayMs, minDelayMs * (2 ** safeRetries));
    const jitter = 0.8 + Math.max(0, Math.min(1, random())) * 0.4;
    return Math.min(maxDelayMs, Math.max(minDelayMs, Math.round(baseDelay * jitter)));
  };
};

/** @param {RedisClient} client @param {'publisher' | 'subscriber'} role @param {RedisLogger} logger */
const observeClient = (client, role, logger) => {
  // Redis EventEmitters must have an error listener; otherwise an operational
  // connection failure can terminate the Node process.
  client.on('error', () => logger.error('redis.client.error', { role }));
  client.on('reconnecting', () => logger.warn('redis.client.reconnecting', { role }));
  client.on('ready', () => logger.info('redis.client.ready', { role }));
};

/** @param {RedisClient} client @param {'publisher' | 'subscriber'} role @param {RedisLogger} logger */
const closeClient = async (client, role, logger) => {
  if (client.isOpen === false) return;
  try {
    if (client.quit) {
      await client.quit();
      return;
    }
  } catch {
    logger.warn('redis.client.quit.failed', { role });
  }

  try {
    client.disconnect?.();
  } catch {
    logger.warn('redis.client.disconnect.failed', { role });
  }
};

/**
 * Creates paired Redis pub/sub clients with one explicit lifecycle owner.
 * Do not log this boundary's `url`: Redis URLs may contain credentials.
 *
 * @param {{
 *   url: string,
 *   namespace?: string,
 *   requireTls?: boolean,
 *   reconnect?: { minDelayMs?: number, maxDelayMs?: number, random?: () => number },
 *   createClient?: RedisClientFactory,
 *   logger?: RedisLogger
 * }} options
 */
export const createRedisClientBoundary = (options) => {
  if (!options || typeof options !== 'object') {
    throw new Error('Redis client options are required.');
  }
  validateRedisUrl(options.url, { requireTls: options.requireTls });
  const namespace = normalizeRedisNamespace(options.namespace);
  const reconnectStrategy = createRedisReconnectStrategy(options.reconnect);
  const createClient = options.createClient ?? /** @type {RedisClientFactory} */ (createNodeRedisClient);
  const logger = options.logger ?? defaultLogger;
  const clientOptions = { url: options.url, socket: { reconnectStrategy } };
  const publisher = createClient(clientOptions);
  const subscriber = publisher.duplicate();
  observeClient(publisher, 'publisher', logger);
  observeClient(subscriber, 'subscriber', logger);

  /** @type {RedisLifecycleState} */
  let state = 'idle';
  /** @type {Promise<void> | null} */
  let connectPromise = null;
  /** @type {Promise<void> | null} */
  let closePromise = null;

  const connect = async () => {
    if (state === 'ready') return;
    if (state === 'closed' || state === 'closing') {
      throw new Error('Redis clients are closed. Create a new boundary to reconnect.');
    }
    if (connectPromise) return connectPromise;

    state = 'connecting';
    connectPromise = Promise.all([publisher.connect(), subscriber.connect()])
      .then(() => {
        if (state === 'closing' || state === 'closed') return;
        state = 'ready';
        logger.info('redis.clients.connected', { namespace });
      })
      .catch(async (error) => {
        logger.error('redis.clients.connect.failed');
        await Promise.allSettled([
          closeClient(publisher, 'publisher', logger),
          closeClient(subscriber, 'subscriber', logger)
        ]);
        if (state !== 'closing') state = 'closed';
        throw error;
      })
      .finally(() => {
        connectPromise = null;
      });
    return connectPromise;
  };

  const close = async () => {
    if (state === 'closed') return;
    if (closePromise) return closePromise;
    state = 'closing';
    closePromise = Promise.allSettled([
      closeClient(publisher, 'publisher', logger),
      closeClient(subscriber, 'subscriber', logger)
    ]).then(() => {
      state = 'closed';
      logger.info('redis.clients.closed', { namespace });
    });
    return closePromise;
  };

  return Object.freeze({
    publisher,
    subscriber,
    namespace,
    adapterKey: `${namespace}:socket.io`,
    connect,
    close,
    getState: () => state
  });
};

/**
 * Connect Redis and install the Socket.IO adapter. The caller must call the
 * returned `close` method during server shutdown.
 * @param {{
 *   io: { adapter: (adapter: unknown) => unknown },
 *   redis: ReturnType<typeof createRedisClientBoundary>,
 *   requestTimeoutMs?: number,
 *   createAdapter?: SocketIoRedisAdapterFactory,
 *   logger?: RedisLogger
 * }} options
 */
export const wireSocketIoRedisAdapter = async (options) => {
  if (!options?.io || !options.redis) {
    throw new Error('Socket.IO instance and Redis boundary are required.');
  }
  const requestTimeoutMs = requireInteger(
    options.requestTimeoutMs ?? 5_000,
    'requestTimeoutMs',
    { min: 100, max: 60_000 }
  );
  const createAdapter = options.createAdapter ?? createSocketIoRedisAdapter;
  const logger = options.logger ?? defaultLogger;

  await options.redis.connect();
  try {
    const adapter = createAdapter(options.redis.publisher, options.redis.subscriber, {
      key: options.redis.adapterKey,
      requestsTimeout: requestTimeoutMs,
      publishOnSpecificResponseChannel: true
    });
    options.io.adapter(adapter);
    logger.info('redis.socket_adapter.ready', {
      namespace: options.redis.namespace,
      requestTimeoutMs
    });
  } catch (error) {
    logger.error('redis.socket_adapter.setup.failed');
    await options.redis.close();
    throw error;
  }

  return Object.freeze({ close: options.redis.close });
};
