import assert from 'node:assert/strict';
import test from 'node:test';
import { AlfaSchemaError } from '../../problemProviders/alfa/errors.js';
import { normalizeAlfaProblem } from '../../problemProviders/alfa/normalizer.js';

const fixedNow = () => new Date('2026-07-25T12:00:00.000Z');

const rawProblem = (overrides = {}) => ({
  questionId: '1',
  frontendQuestionId: '1',
  title: 'Two Sum',
  titleSlug: 'two-sum',
  difficulty: 'EASY',
  categoryTitle: 'Algorithms',
  topicTags: [{ slug: 'array' }, { slug: 'hash-table' }],
  likes: 42,
  dislikes: 3,
  paidOnly: false,
  content: '<p>Return the <strong>indices</strong> of two numbers.</p>',
  ...overrides
});

test('Alfa normalizer defaults to restricted metadata-only records without retained content', () => {
  const problem = normalizeAlfaProblem(rawProblem(), {
    storeFullContent: false,
    cacheVersion: 'alfa-v1',
    now: fixedNow
  });

  assert.equal(problem.title, 'Two Sum');
  assert.equal(problem.slug, 'two-sum');
  assert.equal(problem.provenance.state, 'RESTRICTED_METADATA_ONLY');
  assert.equal(problem.provenance.attribution, 'LeetCode');
  assert.equal(problem.provenance.canonicalUrl, 'https://leetcode.com/problems/two-sum/');
  assert.equal(Object.hasOwn(problem, 'statement'), false);
  assert.equal(Object.hasOwn(problem, 'description'), false);
  assert.equal(Object.hasOwn(problem.metadata.alfa, 'content'), false);
  assert.equal(Object.hasOwn(problem.metadata.alfa, 'htmlStatement'), false);
  assert.equal(problem.metadata.alfa.fetchedAt, '2026-07-25T12:00:00.000Z');
  assert.equal(problem.metadata.alfa.cacheVersion, 'alfa-v1');
});

test('Alfa normalizer sanitizes HTML only when full content is explicitly enabled', () => {
  const problem = normalizeAlfaProblem(rawProblem({
    content: [
      '<p onclick="alert(1)">Keep <strong>safe</strong> text.</p>',
      '<script>alert("xss")</script>',
      '<a href="javascript:alert(1)">bad link</a>',
      '<a href="https://example.test/reference">good link</a>'
    ].join('')
  }), {
    storeFullContent: true,
    cacheVersion: 'alfa-v1',
    now: fixedNow
  });

  assert.equal(problem.statement, problem.metadata.alfa.htmlStatement);
  assert.equal(problem.description, problem.metadata.alfa.htmlStatement);
  assert.match(problem.statement, /<strong>safe<\/strong>/);
  assert.match(problem.statement, /https:\/\/example\.test\/reference/);
  assert.doesNotMatch(problem.statement, /<script|onclick|javascript:/i);
  assert.equal(problem.metadata.alfa.content, problem.statement);
});

test('Alfa normalizer never imports provider test material into visible or hidden tests', () => {
  const problem = normalizeAlfaProblem(rawProblem({
    exampleTestcases: '[2,7,11,15]\\n9',
    hiddenTests: [{ input: 'secret', expectedOutput: 'secret' }],
    testCases: [{ input: 'public', expectedOutput: 'public' }]
  }), {
    storeFullContent: true,
    cacheVersion: 'alfa-v1',
    now: fixedNow
  });

  assert.deepEqual(problem.visibleTests, []);
  assert.deepEqual(problem.hiddenTests, []);
  assert.equal(JSON.stringify(problem).includes('secret'), false);
  assert.equal(JSON.stringify(problem).includes('public'), false);
});

test('Alfa normalizer rejects malformed payloads before creating canonical records', () => {
  assert.throws(
    () => normalizeAlfaProblem(null, { storeFullContent: false, cacheVersion: 'alfa-v1' }),
    AlfaSchemaError
  );
  assert.throws(
    () => normalizeAlfaProblem(rawProblem({ titleSlug: '../internal' }), {
      storeFullContent: false,
      cacheVersion: 'alfa-v1'
    }),
    /titleSlug is invalid/
  );
  assert.throws(
    () => normalizeAlfaProblem(rawProblem({ difficulty: 'legendary' }), {
      storeFullContent: false,
      cacheVersion: 'alfa-v1'
    }),
    /difficulty must be EASY, MEDIUM, or HARD/
  );
});
