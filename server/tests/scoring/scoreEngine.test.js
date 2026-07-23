import assert from 'node:assert/strict';
import test from 'node:test';
import { buildScoreBreakdown } from '../../scoring/scoreBreakdown.js';
import {
  createScoreConfig,
  DEFAULT_SCORE_CONFIG,
  SCORE_SCALE,
  ScoreDirections
} from '../../scoring/scoreConfig.js';
import { calculateScore } from '../../scoring/scoreEngine.js';

test('default score uses deterministic fixed-point normalization', () => {
  const metrics = {
    characterCount: 1_000,
    runtimeMs: 2_500
  };
  const first = calculateScore(metrics);
  const second = calculateScore(metrics);

  assert.deepEqual(first, second);
  assert.equal(first.configVersion, DEFAULT_SCORE_CONFIG.version);
  assert.equal(first.score, SCORE_SCALE / 2);
  assert.equal(
    first.components.reduce(
      (sum, component) => sum + component.weightedContribution,
      0
    ),
    first.score
  );
});

test('config supports extensible lower- and higher-is-better metrics', () => {
  const config = createScoreConfig({
    version: 'extended-v1',
    components: [
      {
        key: 'characterCount',
        label: 'Characters',
        direction: ScoreDirections.LOWER_IS_BETTER,
        min: 0,
        max: 100,
        weightBps: 5_000
      },
      {
        key: 'compressionScore',
        label: 'Compression',
        direction: ScoreDirections.HIGHER_IS_BETTER,
        min: 0,
        max: 10_000,
        weightBps: 3_000
      },
      {
        key: 'memoryBytes',
        label: 'Memory',
        direction: ScoreDirections.LOWER_IS_BETTER,
        min: 1_000,
        max: 11_000,
        weightBps: 2_000
      }
    ]
  });
  const result = calculateScore(
    {
      characterCount: 50,
      compressionScore: 5_000,
      memoryBytes: 6_000
    },
    config
  );

  assert.equal(result.score, 500_000);
  assert.deepEqual(
    result.components.map((component) => component.weightedContribution),
    [250_000, 150_000, 100_000]
  );
});

test('score values clamp to configured ranges', () => {
  const result = calculateScore({
    characterCount: 100_000,
    runtimeMs: -100
  });

  assert.equal(result.components[0].clampedValue, 2_000);
  assert.equal(result.components[0].normalizedScore, 0);
  assert.equal(result.components[1].clampedValue, 0);
  assert.equal(result.components[1].normalizedScore, SCORE_SCALE);
  assert.equal(result.score, 200_000);
});

test('score breakdown contributions exactly match the final score', () => {
  const result = calculateScore({
    characterCount: 333,
    runtimeMs: 777
  });
  const breakdown = buildScoreBreakdown(result);

  assert.equal(breakdown.score, result.score);
  assert.equal(
    breakdown.components.reduce(
      (sum, component) => sum + component.weightedContribution,
      0
    ),
    result.score
  );
  assert.match(breakdown.summary, /code-golf-v1/);
  assert.equal(breakdown.components[0].weight, '80.00%');
});

test('score config rejects invalid and non-deterministic inputs', () => {
  assert.throws(
    () =>
      createScoreConfig({
        components: [
          {
            key: 'characters',
            label: 'Characters',
            direction: 'lower',
            min: 0,
            max: 100,
            weightBps: 9_999
          }
        ]
      }),
    /weights must total/
  );

  assert.throws(
    () => calculateScore({ characterCount: 1.5, runtimeMs: 1 }),
    /safe integer/
  );
  assert.throws(
    () => calculateScore({ characterCount: 1 }),
    /runtimeMs must be a safe integer/
  );
});
