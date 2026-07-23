import { SCORE_SCALE, WEIGHT_SCALE } from './scoreConfig.js';

const formatBasisPoints = (basisPoints) => {
  const whole = Math.floor(basisPoints / 100);
  const fraction = String(basisPoints % 100).padStart(2, '0');
  return `${whole}.${fraction}%`;
};

export const buildScoreBreakdown = (scoreResult) => {
  if (
    !scoreResult ||
    !Number.isSafeInteger(scoreResult.score) ||
    !Array.isArray(scoreResult.components)
  ) {
    throw new TypeError('scoreResult must be returned by calculateScore');
  }

  const components = scoreResult.components.map((component) => ({
    key: component.key,
    label: component.label,
    inputValue: component.inputValue,
    clampedValue: component.clampedValue,
    range: {
      min: component.min,
      max: component.max
    },
    direction: component.direction,
    weightBps: component.weightBps,
    weight: formatBasisPoints(component.weightBps),
    normalizedScore: component.normalizedScore,
    weightedContribution: component.weightedContribution,
    explanation:
      `${component.label}: ${component.inputValue} ` +
      `(${component.direction} is better), weighted ${formatBasisPoints(
        component.weightBps
      )}`
  }));

  const contributionTotal = components.reduce(
    (sum, component) => sum + component.weightedContribution,
    0
  );

  if (contributionTotal !== scoreResult.score) {
    throw new RangeError('component contributions do not equal final score');
  }

  return {
    score: scoreResult.score,
    maxScore: scoreResult.maxScore ?? SCORE_SCALE,
    configVersion: scoreResult.configVersion,
    weightScale: WEIGHT_SCALE,
    summary:
      `${scoreResult.score}/${scoreResult.maxScore ?? SCORE_SCALE} points ` +
      `using ${scoreResult.configVersion}`,
    components
  };
};
