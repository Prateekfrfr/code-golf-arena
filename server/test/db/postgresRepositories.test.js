import assert from 'node:assert/strict';
import test from 'node:test';
import { createPostgresProblemRepository } from '../../db/repositories/postgresProblemRepository.js';
import { createPostgresSubmissionRepository } from '../../db/repositories/postgresSubmissionRepository.js';

const canonicalProblem = Object.freeze({
  title: 'Add two integers',
  slug: 'add-two-integers',
  statement: 'Read two integers and print their sum.',
  description: 'Read two integers and print their sum.',
  explanation: '',
  examples: [],
  constraints: [],
  difficulty: 'easy',
  topic: 'math',
  tags: ['math'],
  starterCode: {},
  supportedLanguages: ['python'],
  visibleTests: [{ input: '1 2', expectedOutput: '3' }],
  hiddenTests: [],
  edgeCases: [],
  timeLimitMs: 5000,
  memoryLimitMb: 128,
  metadata: {},
  version: '1'
});

test('PostgreSQL problem repository parameterizes search filters and returns canonical wrappers', async () => {
  const calls = [];
  const database = {
    async query(text, values = []) {
      calls.push({ text, values });
      if (text.startsWith('SELECT count')) return { rows: [{ total: 1 }] };
      return {
        rows: [{
          id: '4c4f97b8-4916-41fa-bae4-7bb5b7857f1b',
          slug: canonicalProblem.slug,
          current_fingerprint: 'a'.repeat(64),
          current_version: 1,
          source_key: 'local:fixtures',
          problem: canonicalProblem
        }]
      };
    },
    async transaction(work) {
      return work(this);
    }
  };
  const repository = createPostgresProblemRepository({ database });
  const result = await repository.listProblems({
    search: "sum'); DROP TABLE problems; --",
    topic: 'math',
    limit: 10
  });

  assert.equal(result.items[0].problem.slug, canonicalProblem.slug);
  assert.equal(calls.length, 2);
  assert.match(calls[0].text, /ILIKE \$1/);
  assert.equal(calls[0].text.includes("DROP TABLE"), false);
  assert.equal(calls[0].values[0], "%sum'); DROP TABLE problems; --%");
  assert.equal(calls[0].values[3], 'math');
});

test('PostgreSQL submission repository writes submission, score, and analytics together', async () => {
  const calls = [];
  let transactions = 0;
  const database = {
    async transaction(work) {
      transactions += 1;
      return work({
        async query(text, values = []) {
          calls.push({ text, values });
          if (text.startsWith('INSERT INTO users')) {
            return { rows: [{ id: 'd75de7f8-0fe9-4f7b-b880-536482eefd77', guest_id: 'guest-1' }] };
          }
          if (text.startsWith('SELECT id, slug')) {
            return { rows: [{ id: '4c4f97b8-4916-41fa-bae4-7bb5b7857f1b', slug: canonicalProblem.slug }] };
          }
          return { rows: [] };
        }
      });
    },
    async query() {
      return { rows: [] };
    }
  };
  const repository = createPostgresSubmissionRepository({ database });
  const stored = await repository.add('ROOM1234', {
    id: 'ae647705-e50a-473d-9b66-f81f302857e5',
    submittedAt: Date.UTC(2026, 0, 1),
    playerId: 'guest-1',
    problemId: canonicalProblem.slug,
    sourceCode: 'print(3)',
    language: 'python',
    status: 'accepted',
    characterCount: 8,
    characterBytes: 8,
    codePointCount: 8,
    runtimeMs: 10,
    memoryBytes: 1024,
    score: 123,
    maxScore: 1000,
    scoreBreakdown: { configVersion: 'code-golf-v1', score: 123 },
    compression: null,
    compressionScore: null,
    analytics: { rank: 1 }
  });

  assert.equal(transactions, 1);
  assert.equal(stored.id, 'ae647705-e50a-473d-9b66-f81f302857e5');
  assert.equal(calls.length, 5);
  assert.match(calls[2].text, /INSERT INTO submissions/);
  assert.match(calls[3].text, /INSERT INTO submission_scores/);
  assert.equal(calls[3].values[3], 'code-golf-v1');
  assert.match(calls[4].text, /INSERT INTO submission_analytics/);
});
