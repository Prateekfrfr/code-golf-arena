import {
  DEFAULT_SCORE_CONFIG,
  SCORE_SCALE,
  ScoreDirections,
  WEIGHT_SCALE
} from './scoreConfig.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const divideRoundHalfUp = (numerator, denominator) =>
  (numerator + denominator / 2n) / denominator;

const normalizeMetric = (value, component) => {
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(`${component.key} must be a safe integer`);
  }

  const clampedValue = clamp(value, component.min, component.max);
  const range = BigInt(component.max - component.min);
  const distance =
    component.direction === ScoreDirections.LOWER_IS_BETTER
      ? BigInt(component.max - clampedValue)
      : BigInt(clampedValue - component.min);
  const normalizedScore = Number(
    divideRoundHalfUp(distance * BigInt(SCORE_SCALE), range)
  );

  return {
    inputValue: value,
    clampedValue,
    normalizedScore
  };
};

const allocateContributions = (components) => {
  const denominator = BigInt(WEIGHT_SCALE);
  const allocations = components.map((component, index) => {
    const numerator =
      BigInt(component.normalizedScore) * BigInt(component.weightBps);

    return {
      index,
      points: Number(numerator / denominator),
      remainder: numerator % denominator
    };
  });
  const totalNumerator = components.reduce(
    (sum, component) =>
      sum + BigInt(component.normalizedScore) * BigInt(component.weightBps),
    0n
  );
  const totalScore = Number(divideRoundHalfUp(totalNumerator, denominator));
  const allocatedScore = allocations.reduce(
    (sum, allocation) => sum + allocation.points,
    0
  );
  let pointsToAllocate = totalScore - allocatedScore;

  const allocationOrder = [...allocations].sort((left, right) => {
    if (left.remainder === right.remainder) {
      return left.index - right.index;
    }

    return left.remainder > right.remainder ? -1 : 1;
  });

  for (const allocation of allocationOrder) {
    if (pointsToAllocate <= 0) break;
    allocation.points += 1;
    pointsToAllocate -= 1;
  }

  allocations.sort((left, right) => left.index - right.index);

  return {
    totalScore,
    contributions: allocations.map((allocation) => allocation.points)
  };
};

export const calculateScore = (metrics, config = DEFAULT_SCORE_CONFIG) => {
  if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) {
    throw new TypeError('metrics must be an object');
  }

  if (!config || !Array.isArray(config.components)) {
    throw new TypeError('config must be created with createScoreConfig');
  }

  const normalizedComponents = config.components.map((component) => ({
    ...component,
    ...normalizeMetric(metrics[component.key], component)
  }));
  const { totalScore, contributions } = allocateContributions(
    normalizedComponents
  );
  const components = normalizedComponents.map((component, index) =>
    Object.freeze({
      ...component,
      weightedContribution: contributions[index]
    })
  );

  return Object.freeze({
    score: totalScore,
    maxScore: config.scale,
    configVersion: config.version,
    components: Object.freeze(components)
  });
};
