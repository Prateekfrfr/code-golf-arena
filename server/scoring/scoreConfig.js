export const SCORE_SCALE = 1_000_000;
export const WEIGHT_SCALE = 10_000;

export const ScoreDirections = Object.freeze({
  LOWER_IS_BETTER: 'lower',
  HIGHER_IS_BETTER: 'higher'
});

const assertSafeInteger = (value, name) => {
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(`${name} must be a safe integer`);
  }
};

const normalizeComponent = (component, index) => {
  if (!component || typeof component !== 'object' || Array.isArray(component)) {
    throw new TypeError(`components[${index}] must be an object`);
  }

  const key = String(component.key || '').trim();
  const label = String(component.label || key).trim();
  const direction = component.direction;

  if (!key) {
    throw new TypeError(`components[${index}].key is required`);
  }

  if (!label) {
    throw new TypeError(`components[${index}].label is required`);
  }

  if (!Object.values(ScoreDirections).includes(direction)) {
    throw new TypeError(
      `components[${index}].direction must be "lower" or "higher"`
    );
  }

  assertSafeInteger(component.min, `components[${index}].min`);
  assertSafeInteger(component.max, `components[${index}].max`);
  assertSafeInteger(component.weightBps, `components[${index}].weightBps`);

  if (component.min >= component.max) {
    throw new RangeError(`components[${index}] must have min < max`);
  }

  if (component.weightBps < 0 || component.weightBps > WEIGHT_SCALE) {
    throw new RangeError(
      `components[${index}].weightBps must be between 0 and ${WEIGHT_SCALE}`
    );
  }

  return Object.freeze({
    key,
    label,
    direction,
    min: component.min,
    max: component.max,
    weightBps: component.weightBps
  });
};

export const createScoreConfig = ({
  version = 'custom-v1',
  components
} = {}) => {
  const normalizedVersion = String(version || '').trim();

  if (!normalizedVersion) {
    throw new TypeError('version is required');
  }

  if (!Array.isArray(components) || components.length === 0) {
    throw new TypeError('components must be a non-empty array');
  }

  const normalizedComponents = components.map(normalizeComponent);
  const componentKeys = new Set(
    normalizedComponents.map((component) => component.key)
  );

  if (componentKeys.size !== normalizedComponents.length) {
    throw new TypeError('component keys must be unique');
  }

  const totalWeight = normalizedComponents.reduce(
    (sum, component) => sum + component.weightBps,
    0
  );

  if (totalWeight !== WEIGHT_SCALE) {
    throw new RangeError(
      `component weights must total ${WEIGHT_SCALE} basis points`
    );
  }

  return Object.freeze({
    version: normalizedVersion,
    scale: SCORE_SCALE,
    weightScale: WEIGHT_SCALE,
    components: Object.freeze(normalizedComponents)
  });
};

export const DEFAULT_SCORE_CONFIG = createScoreConfig({
  version: 'code-golf-v1',
  components: [
    {
      key: 'characterCount',
      label: 'Character count',
      direction: ScoreDirections.LOWER_IS_BETTER,
      min: 0,
      max: 2_000,
      weightBps: 8_000
    },
    {
      key: 'runtimeMs',
      label: 'Runtime',
      direction: ScoreDirections.LOWER_IS_BETTER,
      min: 0,
      max: 5_000,
      weightBps: 2_000
    }
  ]
});
