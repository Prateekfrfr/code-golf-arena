import assert from 'node:assert/strict';
import test from 'node:test';
import { ValidationError } from '../../errors/index.js';
import { createPostgresLeaderboardRepository } from '../../db/repositories/postgresLeaderboardRepository.js';

const aggregateRow = Object.freeze({
  user_id: 'd75de7f8-0fe9-4f7b-b880-536482eefd77',
  display_name: 'Player one',
  total_score: '420',
  solved_count: '3',
  total_character_count: '57',
  total_runtime_ms: '33',
  last_submitted_at: '2026-01-02T03:04:05.000Z',
  rank: '1'
});

const createDatabase = ({ rows = [aggregateRow], total = 1 } = {}) => {
  const calls = [];
  return {
    calls,
    async query(text, values = []) {
      calls.push({ text, values });
      if (text.includes('COUNT(*)::INTEGER AS total')) return { rows: [{ total }] };
      return { rows };
    }
  };
};

test('PostgreSQL leaderboard repository uses parameters for global leaderboard filters', async () => {
  const database = createDatabase();
  const repository = createPostgresLeaderboardRepository({ database });
  const result = await repository.getGlobalLeaderboard({
    language: "py'--",
    limit: 10,
    cursor: 4
  });

  assert.deepEqual(result.items[0], {
    userId: 'd75de7f8-0fe9-4f7b-b880-536482eefd77',
    displayName: 'Player one',
    totalScore: 420,
    solvedCount: 3,
    totalCharacterCount: 57,
    totalRuntimeMs: 33,
    lastSubmittedAt: Date.parse('2026-01-02T03:04:05.000Z'),
    rank: 1
  });
  assert.equal(result.nextCursor, null);
  assert.equal(database.calls.length, 2);
  assert.equal(database.calls[0].text.includes('DROP TABLE'), false);
  assert.match(database.calls[0].text, /COALESCE\(NULLIF\(btrim\(u\.display_name\), ''\), NULLIF\(u\.guest_id, ''\), u\.email\)/);
  assert.equal(database.calls[0].values[1], "py'--");
  assert.deepEqual(database.calls[0].values.slice(3), [10, 4]);
});

test('PostgreSQL leaderboard repository scopes per-problem and per-language lookups', async () => {
  const database = createDatabase({ total: 2 });
  const repository = createPostgresLeaderboardRepository({ database });

  const problem = await repository.getProblemLeaderboard('Add-Two', { limit: 2 });
  assert.equal(problem.total, 2);
  assert.equal(database.calls[0].values[0], 'add-two');
  assert.equal(database.calls[0].values[1], null);

  await repository.getLanguageLeaderboard('JavaScript', { cursor: 1 });
  assert.equal(database.calls[2].values[0], null);
  assert.equal(database.calls[2].values[1], 'javascript');
  assert.deepEqual(database.calls[2].values.slice(3), [25, 1]);
});

test('PostgreSQL leaderboard repository returns personal bests and solved/unsolved progress', async () => {
  const personalRow = {
    problem_slug: 'add-two',
    problem_title: 'Add two',
    language: 'python',
    score: '100',
    character_count: 9,
    runtime_ms: '5',
    submitted_at: '2026-01-02T03:04:05.000Z',
    rank: '1'
  };
  const solvedRow = {
    problem_slug: 'add-two',
    problem_title: 'Add two',
    difficulty: 'easy',
    topic: 'math',
    submission_id: 'a004712a-7349-4518-a1d8-19d73cfe7b43',
    language: 'python',
    score: '100',
    character_count: 9,
    runtime_ms: '5',
    submitted_at: '2026-01-02T03:04:05.000Z'
  };
  const database = createDatabase({ rows: [personalRow] });
  const repository = createPostgresLeaderboardRepository({ database });
  const userId = 'd75de7f8-0fe9-4f7b-b880-536482eefd77';
  const personal = await repository.getPersonalLeaderboard(userId);
  assert.equal(personal.items[0].problemSlug, 'add-two');
  assert.equal(database.calls[0].values[0], userId);

  database.calls.length = 0;
  const originalQuery = database.query;
  database.query = async (text, values = []) => {
    database.calls.push({ text, values });
    if (text.includes('COUNT(*)::INTEGER AS total')) return { rows: [{ total: 1 }] };
    return { rows: [solvedRow] };
  };
  const progress = await repository.getProgress(userId, { status: 'solved', language: 'python' });
  assert.equal(progress.items[0].status, 'solved');
  assert.equal(progress.items[0].bestSubmission?.score, 100);
  assert.deepEqual(database.calls[0].values.slice(0, 3), [userId, 'python', 'solved']);
  database.query = originalQuery;

  await assert.rejects(
    () => repository.getProgress(userId, { status: /** @type {any} */ ('anything') }),
    (error) => error instanceof ValidationError && error.code === 'LEADERBOARD_QUERY_INVALID'
  );
});

test('PostgreSQL leaderboard repository rejects unbounded query inputs', async () => {
  const repository = createPostgresLeaderboardRepository({ database: createDatabase() });
  assert.throws(() => repository.getProblemLeaderboard('x'.repeat(161)), ValidationError);
  await assert.rejects(() => repository.getGlobalLeaderboard({ limit: 101 }), ValidationError);
  await assert.rejects(() => repository.getPersonalLeaderboard(''), ValidationError);
  await assert.rejects(() => repository.getProgress('guest-1'), ValidationError);
});
