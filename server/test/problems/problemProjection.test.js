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

test('restricted metadata-only provenance only exposes attribution and canonical URL', () => {
  const restricted = {
    title: 'Restricted Problem',
    statement: '<article>Copyrighted statement</article>',
    difficulty: 'hard',
    visibleTests: [{ input: 'sample', expectedOutput: 'sample output' }],
    metadata: {
      public: {
        content: '<script>never expose this</script>',
        html: '<p>never expose this either</p>'
      },
      content: 'stored content is never public for a restricted record'
    },
    provenance: {
      state: 'RESTRICTED_METADATA_ONLY',
      attribution: 'LeetCode',
      canonicalUrl: 'https://leetcode.com/problems/restricted-problem/'
    }
  };

  const publicProblem = toPublicProblem(restricted);
  const serialized = JSON.stringify(publicProblem);
  assert.equal(publicProblem.provenance.state, 'RESTRICTED_METADATA_ONLY');
  assert.equal(publicProblem.attribution, 'LeetCode');
  assert.equal(
    publicProblem.canonicalUrl,
    'https://leetcode.com/problems/restricted-problem/'
  );
  for (const forbidden of [
    'statement',
    'description',
    'explanation',
    'visibleTests',
    'testCases',
    'metadata',
    'starterCode'
  ]) {
    assert.equal(Object.hasOwn(publicProblem, forbidden), false);
  }
  assert.equal(serialized.includes('Copyrighted statement'), false);
  assert.equal(serialized.includes('never expose this'), false);
  assert.throws(
    () => toJudgeProblem(restricted),
    (error) => error?.code === 'RESTRICTED_PROBLEM_NOT_JUDGEABLE'
  );
});
