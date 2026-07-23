import assert from 'node:assert/strict';
import test from 'node:test';
import { createExecutionQueue } from '../../execution/executionQueue.js';
import { outputsMatch } from '../../judge.js';
import { createSocketRateLimiter } from '../../rateLimit/socketRateLimiter.js';
import { createScoreRepository } from '../../repositories/scoreRepository.js';
import {
  compareLeaderboardEntries,
  createSubmissionRepository
} from '../../repositories/submissionRepository.js';
import {
  PayloadValidationError,
  parseCodeUpdate,
  parseMetadata
} from '../../validation/payloads.js';

test('socket payload validation bounds UTF-8 code and metadata', () => {
  const parsed = parseCodeUpdate(
    {
      roomCode: 'abc23456',
      code: 'λ',
      language: 'python'
    },
    2
  );

  assert.equal(parsed.roomCode, 'ABC23456');
  assert.equal(parsed.code, 'λ');
  assert.throws(
    () =>
      parseCodeUpdate(
        { roomCode: 'ABC23456', code: 'λλ', language: 'python' },
        3
      ),
    PayloadValidationError
  );
  assert.deepEqual(parseMetadata({ durationMs: 12, source: 'visibility' }), {
    durationMs: 12,
    source: 'visibility'
  });
  assert.throws(() => parseMetadata({ nested: { unsafe: true } }));
});

test('socket rate limiting resets deterministically', () => {
  let now = 1_000;
  const limiter = createSocketRateLimiter({
    now: () => now,
    rules: { action: { limit: 2, windowMs: 500 } }
  });

  assert.equal(limiter.consume('guest', 'action').allowed, true);
  assert.equal(limiter.consume('guest', 'action').allowed, true);
  assert.equal(limiter.consume('guest', 'action').allowed, false);
  now += 500;
  assert.equal(limiter.consume('guest', 'action').allowed, true);
});

test('execution queue never exceeds configured concurrency', async () => {
  const queue = createExecutionQueue({ concurrency: 2 });
  let active = 0;
  let maximumActive = 0;

  const operation = async (value) => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise((resolve) => setTimeout(resolve, 10));
    active -= 1;
    return value;
  };

  const values = await Promise.all([
    queue.run(() => operation(1)),
    queue.run(() => operation(2)),
    queue.run(() => operation(3)),
    queue.run(() => operation(4))
  ]);

  assert.deepEqual(values, [1, 2, 3, 4]);
  assert.equal(maximumActive, 2);
  assert.deepEqual(queue.getStats(), {
    active: 0,
    queued: 0,
    concurrency: 2
  });
});

test('submission repository keeps immutable attempts and deterministic bests', () => {
  const repository = createSubmissionRepository({ maxPerRoom: 3 });
  repository.add('ROOM', {
    id: 'slow',
    playerId: 'a',
    userId: 'a',
    success: true,
    score: 900,
    characterCount: 30,
    runtimeMs: 20,
    submittedAt: 2
  });
  repository.add('ROOM', {
    id: 'fast',
    playerId: 'a',
    userId: 'a',
    success: true,
    score: 900,
    characterCount: 30,
    runtimeMs: 10,
    submittedAt: 3
  });
  repository.add('ROOM', {
    id: 'winner',
    playerId: 'b',
    userId: 'b',
    success: true,
    score: 950,
    characterCount: 40,
    runtimeMs: 50,
    submittedAt: 4
  });

  assert.deepEqual(
    repository.getLeaderboard('ROOM').map((entry) => entry.id),
    ['winner', 'fast']
  );
  assert.equal(Object.isFrozen(repository.list('ROOM')[0]), true);
  assert.equal(
    compareLeaderboardEntries(
      { id: 'a', score: 10, characterCount: 2, runtimeMs: 2, submittedAt: 1 },
      { id: 'b', score: 9, characterCount: 1, runtimeMs: 1, submittedAt: 1 }
    ) < 0,
    true
  );
});

test('live score repository treats a higher score as better', () => {
  const repository = createScoreRepository();
  const room = { scores: {} };

  assert.equal(
    repository.updateBestScore(room, 'player', {
      score: 800,
      characterCount: 20,
      runtimeMs: 30
    }),
    true
  );
  assert.equal(
    repository.updateBestScore(room, 'player', {
      score: 700,
      characterCount: 10,
      runtimeMs: 10
    }),
    false
  );
  assert.equal(room.scores.player.score, 800);
});

test('judge JSON comparison is key-order independent', () => {
  assert.equal(outputsMatch('{"b":2,"a":1}', { a: 1, b: 2 }), true);
  assert.equal(outputsMatch('[1,2]', [2, 1]), false);
});
