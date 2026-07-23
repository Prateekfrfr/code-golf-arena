import assert from 'node:assert/strict';
import test from 'node:test';
import {
  toJudgeProblem,
  toPublicProblem
} from '../../problems/problemProjection.js';

const source = {
  title: 'Secret Tests',
  statement: 'Keep judge data private.',
  difficulty: 'medium',
  visibleTests: [{ input: 'public', expectedOutput: 'visible' }],
  hiddenTests: [{ input: 'secret', expectedOutput: 'classified' }],
  metadata: {
    sourceId: 'private-source',
    hiddenTests: [{ input: 'metadata-secret', expectedOutput: 'metadata-secret' }],
    public: { category: 'demo' }
  }
};

test('public projection cannot expose hidden tests', () => {
  const publicProblem = toPublicProblem(source);
  const serialized = JSON.stringify(publicProblem);
  assert.equal(Object.hasOwn(publicProblem, 'hiddenTests'), false);
  assert.equal(serialized.includes('"input":"secret"'), false);
  assert.equal(serialized.includes('classified'), false);
  assert.equal(serialized.includes('metadata-secret'), false);
  assert.equal(serialized.includes('private-source'), false);
  assert.deepEqual(publicProblem.metadata, { category: 'demo' });
  assert.deepEqual(publicProblem.testCases, publicProblem.visibleTests);
});

test('judge projection includes hidden tests only in its compatibility testCases', () => {
  const judgeProblem = toJudgeProblem(source);
  assert.equal(Object.hasOwn(judgeProblem, 'hiddenTests'), false);
  assert.equal(judgeProblem.testCases.length, 2);
  assert.equal(judgeProblem.testCases[1].input, 'secret');
});
