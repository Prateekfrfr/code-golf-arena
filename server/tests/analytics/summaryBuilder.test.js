import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSubmissionAnalytics,
  compareSubmissionPerformance
} from '../../analytics/summaryBuilder.js';

const submissions = [
  {
    id: 'u1-first',
    userId: 'u1',
    problemId: 'sum',
    language: 'python',
    status: 'accepted',
    score: 800_000,
    characterCount: 20,
    runtimeMs: 100,
    memoryBytes: 2_000,
    compressionScore: 3_000,
    submittedAt: 100
  },
  {
    id: 'u1-rejected',
    userId: 'u1',
    problemId: 'sum',
    language: 'python',
    status: 'rejected',
    score: 300_000,
    characterCount: 19,
    runtimeMs: 90,
    submittedAt: 200
  },
  {
    id: 'u3-best',
    userId: 'u3',
    problemId: 'sum',
    language: 'javascript',
    success: true,
    score: 700_000,
    charCount: 24,
    runtime: 75,
    submittedAt: 250
  },
  {
    id: 'u2-best',
    userId: 'u2',
    problemId: 'sum',
    language: 'python',
    status: 'accepted',
    score: 950_000,
    characterCount: 16,
    runtimeMs: 70,
    submittedAt: 300
  },
  {
    id: 'u1-best',
    userId: 'u1',
    problemId: 'sum',
    language: 'python',
    status: 'accepted',
    score: 900_000,
    characterCount: 18,
    runtimeMs: 80,
    memoryBytes: 1_800,
    compressionScore: 4_000,
    submittedAt: 400
  },
  {
    id: 'other-problem',
    userId: 'u1',
    problemId: 'reverse',
    language: 'python',
    status: 'accepted',
    score: 999_000,
    characterCount: 5,
    runtimeMs: 5,
    submittedAt: 500
  }
];

test('analytics builds scoped totals, bests, rankings, trends, and comparisons', () => {
  const summary = buildSubmissionAnalytics(submissions, {
    userId: 'u1',
    problemId: 'sum',
    submissionId: 'u1-best'
  });

  assert.deepEqual(summary.totals, {
    submissions: 5,
    accepted: 4,
    rejected: 1,
    acceptanceRateBps: 8_000
  });
  assert.deepEqual(summary.userTotals, {
    submissions: 3,
    accepted: 2,
    rejected: 1,
    acceptanceRateBps: 6_667
  });
  assert.equal(summary.targetSubmission.id, 'u1-best');
  assert.equal(summary.personalBest.id, 'u1-best');
  assert.equal(summary.globalBest.id, 'u2-best');
  assert.equal(summary.languageBest.id, 'u2-best');
  assert.deepEqual(summary.globalRanking, { rank: 2, population: 3 });
  assert.deepEqual(summary.languageRanking, { rank: 2, population: 2 });
  assert.equal(summary.percentileBps, 5_000);
  assert.deepEqual(
    summary.previousAttempts.map((submission) => submission.id),
    ['u1-rejected', 'u1-first']
  );
  assert.equal(summary.trends.runtimeMs.length, 3);
  assert.equal(summary.timeline.length, 3);
  assert.equal(summary.performanceComparison.scoreFromGlobalBest, -50_000);
  assert.equal(summary.byLanguage.length, 2);
});

test('analytics uses deterministic tie breakers', () => {
  const left = {
    id: 'left',
    status: 'accepted',
    score: 100,
    characterCount: 10,
    runtimeMs: 20,
    memoryBytes: 30,
    submittedAt: 100
  };
  const right = {
    ...left,
    id: 'right',
    characterCount: 11
  };

  assert.ok(compareSubmissionPerformance(left, right) < 0);
  assert.ok(compareSubmissionPerformance(right, left) > 0);
});

test('empty analytics summary is well formed', () => {
  const summary = buildSubmissionAnalytics([], { userId: 'nobody' });

  assert.equal(summary.targetSubmission, null);
  assert.equal(summary.globalBest, null);
  assert.equal(summary.personalBest, null);
  assert.equal(summary.percentileBps, null);
  assert.deepEqual(summary.totals, {
    submissions: 0,
    accepted: 0,
    rejected: 0,
    acceptanceRateBps: 0
  });
});

test('analytics rejects malformed metrics and unsafe limits', () => {
  assert.throws(
    () =>
      buildSubmissionAnalytics([
        {
          id: 'bad',
          submittedAt: 1,
          runtimeMs: -1
        }
      ]),
    /non-negative/
  );
  assert.throws(
    () => buildSubmissionAnalytics([], { previousAttemptsLimit: 101 }),
    /between 0 and 100/
  );
});
