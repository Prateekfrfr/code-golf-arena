import assert from 'node:assert/strict';
import test from 'node:test';
import { createInMemoryRoomRepository } from '../../repositories/roomRepository.js';

const expectPromise = (value) => {
  assert.equal(typeof value?.then, 'function');
  return value;
};

test('room repository exposes an awaitable create/get/has/delete lifecycle', async () => {
  const repository = createInMemoryRoomRepository();

  const room = await expectPromise(
    repository.create('ARENA123', 'player-1', 'multiplayer', 'arrays')
  );

  assert.deepEqual(room.players, ['player-1']);
  assert.deepEqual(room.connectedPlayers, ['player-1']);
  assert.equal(room.mode, 'multiplayer');
  assert.equal(room.topic, 'arrays');
  assert.equal(room.status, 'waiting');
  assert.equal(room.cleanupTimer, null);

  assert.equal(await expectPromise(repository.has('ARENA123')), true);
  assert.equal(await expectPromise(repository.get('ARENA123')), room);

  room.status = 'active';
  assert.equal(await expectPromise(repository.save('ARENA123', room)), room);
  assert.equal((await repository.get('ARENA123'))?.status, 'active');

  await expectPromise(repository.delete('ARENA123'));

  assert.equal(await expectPromise(repository.has('ARENA123')), false);
  assert.equal(await expectPromise(repository.get('ARENA123')), null);
});

test('room repository cancels cleanup timers through clearCleanup and delete', async () => {
  const repository = createInMemoryRoomRepository();
  const room = await repository.create('ARENA123', 'player-1');
  let clearCleanupFired = false;

  room.cleanupTimer = setTimeout(() => {
    clearCleanupFired = true;
  }, 20);
  await expectPromise(repository.clearCleanup(room));
  await new Promise((resolve) => setTimeout(resolve, 35));

  assert.equal(clearCleanupFired, false);
  assert.equal(room.cleanupTimer, null);

  let deleteFired = false;
  room.cleanupTimer = setTimeout(() => {
    deleteFired = true;
  }, 20);
  await expectPromise(repository.delete('ARENA123'));
  await new Promise((resolve) => setTimeout(resolve, 35));

  assert.equal(deleteFired, false);
  assert.equal(await repository.get('ARENA123'), null);
});

test('room repository keeps player and connection state semantics when awaited', async () => {
  const repository = createInMemoryRoomRepository();
  const room = await repository.create('ARENA123', 'player-1');

  await expectPromise(repository.addPlayer(room, 'player-2'));
  await repository.addPlayer(room, 'player-2');
  assert.deepEqual(room.players, ['player-1', 'player-2']);
  assert.deepEqual(room.replay['player-2'], []);
  assert.deepEqual(room.antiCheatStats['player-2'], {
    tabSwitches: 0,
    suspiciousPastes: 0,
    submissionSpamAttempts: 0
  });

  await expectPromise(repository.markDisconnected(room, 'player-1'));
  assert.deepEqual(room.connectedPlayers, []);
  await expectPromise(repository.markConnected(room, 'player-2'));
  await repository.markConnected(room, 'player-2');
  assert.deepEqual(room.connectedPlayers, ['player-2']);
});
