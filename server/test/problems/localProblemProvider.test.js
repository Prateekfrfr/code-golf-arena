import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createProblemProvider,
  createProblemProviderRegistry
} from '../../problemProviders/index.js';
import { createLocalProblemProvider } from '../../problemProviders/localProblemProvider.js';
import { assertProblemProvider } from '../../problemProviders/problemProvider.js';

const records = [
  {
    title: 'Alpha',
    statement: 'Alpha statement',
    topic: 'arrays',
    difficulty: 'easy',
    supportedLanguages: ['python'],
    visibleTests: [{ input: '', expectedOutput: 'a' }]
  },
  {
    title: 'Beta',
    statement: 'Beta statement',
    topic: 'strings',
    difficulty: 'hard',
    supportedLanguages: ['javascript'],
    visibleTests: [{ input: '', expectedOutput: 'b' }],
    hiddenTests: [{ input: 'secret', expectedOutput: 'hidden' }]
  }
];

test('default factory remains backward compatible', async () => {
  const provider = createProblemProvider();
  assertProblemProvider(provider);
  const problem = await provider.getRandomProblem('arrays');
  assert.equal(problem.topic, 'arrays');
});

test('local provider implements filtering, pagination, lookup, and private judge access', async () => {
  const provider = createLocalProblemProvider({ records, random: () => 0 });
  assertProblemProvider(provider);
  const page = await provider.listProblems({
    difficulty: 'hard',
    language: 'javascript',
    limit: 1
  });
  assert.equal(page.total, 1);
  assert.equal(page.items[0].slug, 'beta');
  assert.equal(JSON.stringify(page.items[0]).includes('secret'), false);

  const publicProblem = await provider.getBySlug('beta');
  const judgeProblem = await provider.getJudgeProblem('beta');
  assert.equal(publicProblem.testCases.length, 1);
  assert.equal(judgeProblem.testCases.length, 2);
});

test('registry rejects invalid providers and resolves configured providers', () => {
  assert.throws(() => assertProblemProvider({}), /getRandomProblem/);
  const local = createLocalProblemProvider({ records });
  const registry = createProblemProviderRegistry({
    providers: { fixture: local },
    defaultProvider: 'fixture'
  });
  assert.equal(registry.get(), local);
  assert.deepEqual(registry.names(), ['fixture']);
});
