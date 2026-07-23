import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  normalizeProblem,
  ProblemValidationError,
  validateProblem
} from '../../problems/problemSchema.js';

const fixture = async (relativePath) =>
  JSON.parse(
    await readFile(
      new URL(`../fixtures/problems/${relativePath}`, import.meta.url),
      'utf8'
    )
  );

test('normalizes the full canonical schema and legacy compatibility fields', async () => {
  const problem = normalizeProblem(await fixture('valid/full-problem.json'));
  assert.equal(problem.slug, 'add-two-integers');
  assert.equal(problem.description, problem.statement);
  assert.equal(problem.visibleTests.length, 1);
  assert.equal(problem.hiddenTests.length, 1);

  const legacy = normalizeProblem({
    id: 7,
    title: 'Legacy Problem',
    description: 'Legacy statement.',
    topic: 'strings',
    difficulty: 'easy',
    testCases: [{ input: 'a', expectedOutput: 'a' }]
  });
  assert.equal(legacy.slug, 'legacy-problem');
  assert.deepEqual(legacy.tags, ['strings']);
  assert.deepEqual(legacy.supportedLanguages, [
    'python',
    'javascript',
    'cpp',
    'java'
  ]);
  assert.equal(legacy.visibleTests.length, 1);
});

test('rejects missing fields, unknown keys, invalid limits, and mismatched languages', async () => {
  const result = validateProblem(await fixture('invalid/missing-title.json'));
  assert.equal(result.success, false);
  assert.ok(result.issues.some((issue) => issue.includes('title')));

  assert.throws(
    () =>
      normalizeProblem({
        title: 'Unsafe',
        statement: 'Statement',
        difficulty: 'extreme',
        unknown: true,
        starterCode: { python: 'pass' },
        supportedLanguages: ['javascript'],
        timeLimitMs: 99_999,
        visibleTests: [{ input: '', expectedOutput: '' }]
      }),
    (error) =>
      error instanceof ProblemValidationError &&
      error.issues.some((issue) => issue.includes('unknown keys')) &&
      error.issues.some((issue) => issue.includes('difficulty')) &&
      error.issues.some((issue) => issue.includes('timeLimitMs')) &&
      error.issues.some((issue) => issue.includes('starterCode.python'))
  );
});

test('rejects problem documents with no tests', () => {
  assert.throws(
    () =>
      normalizeProblem({
        title: 'No Tests',
        statement: 'Nothing can judge this.',
        difficulty: 'easy'
      }),
    /at least one visible or hidden test/
  );
});
