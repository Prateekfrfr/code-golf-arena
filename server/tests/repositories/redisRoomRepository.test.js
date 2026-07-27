import assert from 'node:assert/strict';
import test from 'node:test';
import { createRedisRoomRepository } from '../../repositories/redisRoomRepository.js';

const createMockRedisClient = () => {
  const values = new Map();
  const writes = [];
  return {
    values,
    writes,
    async get(key) {
      return values.get(key) ?? null;
    },
    async set(key, value, options) {
      writes.push({ key, value, options });
      values.set(key, value);
    },
    async del(key) {
      values.delete(key);
    },
    async exists(key) {
      return values.has(key) ? 1 : 0;
    },
    async *scanIterator({ MATCH: match }) {
      const prefix = match.slice(0, -1);
      for (const key of values.keys()) {
        if (key.startsWith(prefix)) yield key;
      }
    }
  };
};

test('Redis room repository persists a namespaced room lifecycle with TTL', async () => {
  const client = createMockRedisClient();
  const repository = createRedisRoomRepository({
    client,
    namespace: 'test:rooms',
    ttlSeconds: 90
  });

  const room = await repository.create('ARENA/123', 'player-1', 'solo', 'arrays');
  assert.equal(client.writes[0].key, 'test:rooms:ARENA%2F123');
  assert.deepEqual(client.writes[0].options, { EX: 90 });
  assert.equal(room.cleanupTimer, null);
  assert.equal(await repository.has('ARENA/123'), true);

  room.status = 'active';
  await repository.save('ARENA/123', room);
  const loaded = await repository.get('ARENA/123');
  assert.equal(loaded?.status, 'active');
  assert.equal(loaded?.cleanupTimer, null);

  assert.deepEqual(
    (await repository.values()).map(([roomCode]) => roomCode),
    ['ARENA/123']
  );
  await repository.delete('ARENA/123');
  assert.equal(await repository.get('ARENA/123'), null);
});

test('Redis room repository persists awaited player and connection mutations', async () => {
  const client = createMockRedisClient();
  const repository = createRedisRoomRepository({ client });
  const room = await repository.create('ARENA123', 'player-1');

  await repository.addPlayer(room, 'player-2');
  await repository.addPlayer(room, 'player-2');
  await repository.markDisconnected(room, 'player-1');
  await repository.markConnected(room, 'player-2');
  await repository.clearCleanup(room);

  const stored = await repository.get('ARENA123');
  assert.deepEqual(stored?.players, ['player-1', 'player-2']);
  assert.deepEqual(stored?.connectedPlayers, ['player-2']);
  assert.deepEqual(stored?.replay['player-2'], []);
  assert.deepEqual(stored?.antiCheatStats['player-2'], {
    tabSwitches: 0,
    suspiciousPastes: 0,
    submissionSpamAttempts: 0
  });
});

test('Redis room repository rejects malformed or prototype-polluting room JSON', async () => {
  const client = createMockRedisClient();
  const repository = createRedisRoomRepository({ client });
  client.values.set('code-golf-arena:room:BROKEN', '{');
  await assert.rejects(repository.get('BROKEN'), /not valid JSON/);

  client.values.set(
    'code-golf-arena:room:POLLUTED',
    '{"players":[],"connectedPlayers":[],"__proto__":{"polluted":true}}'
  );
  await assert.rejects(repository.get('POLLUTED'), /prohibited property/);
  assert.equal({}.polluted, undefined);

  await assert.rejects(
    repository.create('SAFE', '__proto__'),
    /safe non-empty string/
  );
});
