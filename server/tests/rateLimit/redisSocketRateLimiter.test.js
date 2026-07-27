import assert from 'node:assert/strict';
import test from 'node:test';
import {
  REDIS_SOCKET_RATE_LIMIT_LUA,
  buildRedisSocketRateLimitKey,
  createRedisSocketRateLimiter
} from '../../rateLimit/redisSocketRateLimiter.js';

test('Redis socket limiter evaluates an atomic increment/expiry script with a namespaced key', async () => {
  /** @type {Array<{ script: string, options: { keys: string[], arguments: string[] } }>} */
  const calls = [];
  const client = {
    eval: async (script, options) => {
      calls.push({ script, options });
      return [1, 4_500];
    }
  };
  const limiter = createRedisSocketRateLimiter({
    client,
    namespace: 'arena:rate-limit:v1',
    rules: { submit: { limit: 2, windowMs: 5_000 } }
  });

  assert.deepEqual(await limiter.consume('socket:abc/123', 'submit'), {
    allowed: true,
    retryAfterMs: 0,
    remaining: 1
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].script, REDIS_SOCKET_RATE_LIMIT_LUA);
  assert.deepEqual(calls[0].options, {
    keys: ['arena:rate-limit:v1:submit:socket%3Aabc%2F123'],
    arguments: ['5000']
  });
  assert.match(REDIS_SOCKET_RATE_LIMIT_LUA, /INCR/);
  assert.match(REDIS_SOCKET_RATE_LIMIT_LUA, /PEXPIRE/);
});

test('Redis socket limiter applies Redis counter results without a local race-prone check', async () => {
  const results = [[1, 1_000], [2, 998], [3, 995]];
  const limiter = createRedisSocketRateLimiter({
    eval: async () => results.shift(),
    rules: { action: { limit: 2, windowMs: 1_000 } }
  });

  assert.equal((await limiter.consume('player-1', 'action')).allowed, true);
  assert.deepEqual(await limiter.consume('player-1', 'action'), {
    allowed: true,
    retryAfterMs: 0,
    remaining: 0
  });
  assert.deepEqual(await limiter.consume('player-1', 'action'), {
    allowed: false,
    retryAfterMs: 995,
    remaining: 0
  });
});

test('Redis socket limiter rejects malformed requests and invalid rule configuration within bounded limits', async () => {
  const limiter = createRedisSocketRateLimiter({
    eval: async () => [1, 500],
    rules: { action: { limit: 1, windowMs: 500 } }
  });

  assert.deepEqual(await limiter.consume('', 'action'), {
    allowed: false,
    retryAfterMs: 1_000,
    remaining: 0,
    error: 'invalid_rate_limit_request'
  });
  assert.deepEqual(await limiter.consume('user', '__proto__'), {
    allowed: false,
    retryAfterMs: 1_000,
    remaining: 0,
    error: 'invalid_rate_limit_request'
  });
  assert.throws(
    () => createRedisSocketRateLimiter({ eval: async () => [1, 1], rules: { action: { limit: 0, windowMs: 1 } } }),
    /action\.limit/
  );
  assert.throws(
    () => createRedisSocketRateLimiter({ eval: async () => [1, 1], rules: { action: { limit: 1, windowMs: 86_400_001 } } }),
    /action\.windowMs/
  );
  assert.throws(
    () => createRedisSocketRateLimiter({ eval: async () => [1, 1], namespace: 'bad namespace' }),
    /namespace/
  );
  assert.equal(
    buildRedisSocketRateLimitKey('arena:v1', 'action', 'a:b'),
    'arena:v1:action:a%3Ab'
  );
});

test('Redis socket limiter fails closed on Redis and script-result failures without leaking internals', async () => {
  const observed = [];
  const limiter = createRedisSocketRateLimiter({
    eval: async () => {
      throw new Error('connection password=secret refused');
    },
    unavailableRetryAfterMs: 250,
    onError: (error) => observed.push(error)
  });

  assert.deepEqual(await limiter.consume('user-1', 'submission'), {
    allowed: false,
    retryAfterMs: 250,
    remaining: 0,
    error: 'rate_limit_unavailable'
  });
  assert.equal(observed.length, 1);

  const malformedResultLimiter = createRedisSocketRateLimiter({
    eval: async () => ['not-a-count', -1]
  });
  assert.deepEqual(await malformedResultLimiter.consume('user-1', 'submission'), {
    allowed: false,
    retryAfterMs: 1_000,
    remaining: 0,
    error: 'rate_limit_unavailable'
  });
});
