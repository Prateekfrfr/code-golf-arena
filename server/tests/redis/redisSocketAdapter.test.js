import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createRedisClientBoundary,
  createRedisReconnectStrategy,
  normalizeRedisNamespace,
  validateRedisUrl,
  wireSocketIoRedisAdapter
} from '../../redis/redisSocketAdapter.js';

const createLogger = () => {
  const entries = [];
  return {
    entries,
    info: (event, context = {}) => entries.push({ level: 'info', event, context }),
    warn: (event, context = {}) => entries.push({ level: 'warn', event, context }),
    error: (event, context = {}) => entries.push({ level: 'error', event, context })
  };
};

const createClientPair = ({ failSubscriberConnect = false } = {}) => {
  const clients = [];
  /** @param {'publisher' | 'subscriber'} role */
  const makeClient = (role) => {
    /** @type {Record<string, ((...args: unknown[]) => void)[]>} */
    const listeners = {};
    const client = {
      role,
      isOpen: true,
      connectCalls: 0,
      quitCalls: 0,
      on(event, listener) {
        listeners[event] ??= [];
        listeners[event].push(listener);
      },
      emit(event, ...args) {
        for (const listener of listeners[event] ?? []) listener(...args);
      },
      async connect() {
        client.connectCalls += 1;
        if (role === 'subscriber' && failSubscriberConnect) {
          throw new Error('subscriber unavailable');
        }
      },
      duplicate() {
        return makeClient('subscriber');
      },
      async quit() {
        client.quitCalls += 1;
        client.isOpen = false;
      },
      disconnect() {
        client.isOpen = false;
      }
    };
    clients.push(client);
    return client;
  };
  return { clients, createClient: () => makeClient('publisher') };
};

test('Redis URL validation never returns credentials and can require TLS', () => {
  assert.deepEqual(
    validateRedisUrl('rediss://user:super-secret@cache.example.test:6380/0', {
      requireTls: true
    }),
    { protocol: 'rediss:', hostname: 'cache.example.test', port: '6380' }
  );
  assert.throws(
    () => validateRedisUrl('redis://cache.example.test', { requireTls: true }),
    /rediss/ 
  );
  assert.throws(() => validateRedisUrl('https://cache.example.test'), /redis/);
  assert.equal(normalizeRedisNamespace('arena:prod_1'), 'arena:prod_1');
  assert.throws(() => normalizeRedisNamespace('arena key'), /REDIS_NAMESPACE/);
});

test('Redis reconnect strategy is bounded and jitter can be deterministic', () => {
  const reconnect = createRedisReconnectStrategy({
    minDelayMs: 100,
    maxDelayMs: 1_000,
    random: () => 0.5
  });
  assert.equal(reconnect(0), 100);
  assert.equal(reconnect(3), 800);
  assert.equal(reconnect(99), 1_000);
});

test('Redis boundary configures paired clients, redacts error details through the logger, and closes both', async () => {
  const logger = createLogger();
  const pair = createClientPair();
  /** @type {{ url: string, socket: { reconnectStrategy: (retries: number) => number } } | undefined} */
  let receivedOptions;
  const redis = createRedisClientBoundary({
    url: 'rediss://user:super-secret@cache.example.test:6380/0',
    namespace: 'arena:prod',
    createClient: (options) => {
      receivedOptions = options;
      return pair.createClient();
    },
    logger,
    reconnect: { random: () => 0.5 }
  });

  assert.equal(redis.adapterKey, 'arena:prod:socket.io');
  assert.equal(receivedOptions?.url, 'rediss://user:super-secret@cache.example.test:6380/0');
  assert.equal(pair.clients.length, 2);
  assert.equal(pair.clients[0].role, 'publisher');
  assert.equal(pair.clients[1].role, 'subscriber');
  assert.equal(pair.clients[0].connectCalls, 0);

  await redis.connect();
  await redis.connect();
  assert.equal(redis.getState(), 'ready');
  assert.equal(pair.clients[0].connectCalls, 1);
  assert.equal(pair.clients[1].connectCalls, 1);

  pair.clients[0].emit('error', new Error('redis://user:super-secret@cache.example.test'));
  const errorEntry = logger.entries.find((entry) => entry.event === 'redis.client.error');
  assert.equal(errorEntry.context.role, 'publisher');
  assert.equal(JSON.stringify(logger.entries).includes('super-secret'), false);

  await redis.close();
  assert.equal(redis.getState(), 'closed');
  assert.equal(pair.clients[0].quitCalls, 1);
  assert.equal(pair.clients[1].quitCalls, 1);
});

test('Socket.IO adapter wiring uses the namespace key and rolls Redis back on setup failure', async () => {
  const logger = createLogger();
  const pair = createClientPair();
  const redis = createRedisClientBoundary({
    url: 'redis://localhost:6379',
    namespace: 'arena',
    createClient: pair.createClient,
    logger
  });
  /** @type {unknown} */
  let installedAdapter;
  /** @type {unknown} */
  let adapterOptions;
  const io = { adapter: (adapter) => { installedAdapter = adapter; } };
  const lifecycle = await wireSocketIoRedisAdapter({
    io,
    redis,
    logger,
    requestTimeoutMs: 900,
    createAdapter: (_publisher, _subscriber, options) => {
      adapterOptions = options;
      return { type: 'redis-adapter' };
    }
  });
  assert.deepEqual(installedAdapter, { type: 'redis-adapter' });
  assert.deepEqual(adapterOptions, {
    key: 'arena:socket.io',
    requestsTimeout: 900,
    publishOnSpecificResponseChannel: true
  });
  await lifecycle.close();

  const failedPair = createClientPair();
  const failedRedis = createRedisClientBoundary({
    url: 'redis://localhost:6379',
    createClient: failedPair.createClient,
    logger
  });
  await assert.rejects(
    wireSocketIoRedisAdapter({
      io,
      redis: failedRedis,
      logger,
      createAdapter: () => { throw new Error('adapter setup failed'); }
    }),
    /adapter setup failed/
  );
  assert.equal(failedRedis.getState(), 'closed');
  assert.equal(failedPair.clients.every((client) => client.quitCalls === 1), true);
});

test('Redis boundary closes both clients when a connection fails', async () => {
  const logger = createLogger();
  const pair = createClientPair({ failSubscriberConnect: true });
  const redis = createRedisClientBoundary({
    url: 'redis://localhost:6379',
    createClient: pair.createClient,
    logger
  });
  await assert.rejects(redis.connect(), /subscriber unavailable/);
  assert.equal(redis.getState(), 'closed');
  assert.equal(pair.clients.every((client) => client.quitCalls === 1), true);
});
