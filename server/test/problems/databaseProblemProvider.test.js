import assert from 'node:assert/strict';
import test from 'node:test';
import { createDatabaseProblemProvider } from '../../problemProviders/databaseProblemProvider.js';

const record = {
  title: 'Database Problem',
  statement: 'Loaded through an injected repository.',
  difficulty: 'medium',
  visibleTests: [{ input: 'visible', expectedOutput: 'ok' }],
  hiddenTests: [{ input: 'hidden', expectedOutput: 'secret' }]
};

test('delegates queries and keeps hidden data behind judge lookup', async () => {
  const calls = [];
  const repository = {
    async getBySlug(slug, options) {
      calls.push({ slug, options });
      return record;
    },
    async listProblems(query) {
      calls.push({ query });
      return { items: [record], nextCursor: 'next', total: 2 };
    }
  };
  const provider = createDatabaseProblemProvider({ repository, random: () => 0 });
  const publicProblem = await provider.getBySlug('database-problem');
  const judgeProblem = await provider.getJudgeProblem('database-problem');
  const page = await provider.listProblems({ difficulty: 'medium' });

  assert.equal(publicProblem.testCases.length, 1);
  assert.equal(judgeProblem.testCases.length, 2);
  assert.equal(page.nextCursor, 'next');
  assert.deepEqual(calls[0].options, { includeHidden: false });
  assert.deepEqual(calls[1].options, { includeHidden: true });
  assert.equal(calls[2].query.difficulty, 'medium');
  assert.equal(calls[2].query.limit, 20);
  assert.equal(calls[2].query.cursor, null);
});

test('validates the injected repository contract', () => {
  assert.throws(
    () => createDatabaseProblemProvider({ repository: {} }),
    /repository.getBySlug/
  );
});
