import assert from 'node:assert/strict';
import test from 'node:test';
import { problems } from '../../../data/problems.js';
import {
  toJudgeProblem,
  toPublicProblem
} from '../../problems/problemProjection.js';

test('bundled original catalog stays within the requested 50 to 70 problem range', () => {
  assert.equal(problems.length >= 50, true);
  assert.equal(problems.length <= 70, true);
  assert.equal(new Set(problems.map((problem) => problem.slug)).size, problems.length);
  assert.equal(
    problems.every(
      (problem) =>
        problem.provenance?.state === 'LICENSED' &&
        problem.metadata?.public?.original === true
    ),
    true
  );
});

test('every bundled problem keeps public and hidden judge cases separated', () => {
  for (const problem of problems) {
    assert.equal(problem.visibleTests.length >= 1, true, problem.slug);
    assert.equal(problem.hiddenTests.length >= 1, true, problem.slug);
    assert.equal(Object.hasOwn(toPublicProblem(problem), 'hiddenTests'), false);
    assert.equal(
      toJudgeProblem(problem).testCases.length,
      problem.visibleTests.length + problem.hiddenTests.length,
      problem.slug
    );
  }
});
