const DIFFICULTIES = new Set(['easy', 'medium', 'hard']);
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const LANGUAGE_PATTERN = /^[a-z][a-z0-9_+-]{0,31}$/;
const DEFAULT_SUPPORTED_LANGUAGES = Object.freeze([
  'python',
  'javascript',
  'cpp',
  'java'
]);

export const PROBLEM_LIMITS = Object.freeze({
  title: 200,
  slug: 160,
  statement: 50_000,
  explanation: 50_000,
  examples: 20,
  constraints: 100,
  tags: 30,
  starterLanguages: 30,
  starterCode: 50_000,
  testsPerVisibility: 200,
  testValue: 250_000,
  edgeCases: 100,
  metadataBytes: 50_000,
  timeLimitMs: 30_000,
  memoryLimitMb: 1_024
});

const ALLOWED_KEYS = new Set([
  'id',
  'title',
  'slug',
  'statement',
  'description',
  'explanation',
  'examples',
  'constraints',
  'difficulty',
  'topic',
  'tags',
  'starterCode',
  'supportedLanguages',
  'visibleTests',
  'hiddenTests',
  'testCases',
  'edgeCases',
  'timeLimit',
  'timeLimitMs',
  'memoryLimit',
  'memoryLimitMb',
  'metadata',
  'version'
]);

export class ProblemValidationError extends Error {
  constructor(issues) {
    const normalizedIssues = Array.isArray(issues) ? issues : [String(issues)];
    super(`Invalid problem: ${normalizedIssues.join('; ')}`);
    this.name = 'ProblemValidationError';
    this.issues = normalizedIssues;
  }
}

const isPlainObject = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const ensurePlainObject = (value, path, issues) => {
  if (!isPlainObject(value)) {
    issues.push(`${path} must be a plain object`);
    return {};
  }
  return value;
};

const boundedString = (
  value,
  path,
  issues,
  { required = false, max = 1_000, defaultValue = '' } = {}
) => {
  if (value == null) {
    if (required) issues.push(`${path} is required`);
    return defaultValue;
  }
  if (typeof value !== 'string') {
    issues.push(`${path} must be a string`);
    return defaultValue;
  }
  const normalized = value.trim();
  if (required && normalized.length === 0) issues.push(`${path} cannot be empty`);
  if (normalized.length > max) issues.push(`${path} exceeds ${max} characters`);
  return normalized;
};

const boundedInteger = (
  value,
  path,
  issues,
  { min, max, defaultValue }
) => {
  const candidate = value == null ? defaultValue : value;
  if (!Number.isSafeInteger(candidate) || candidate < min || candidate > max) {
    issues.push(`${path} must be an integer between ${min} and ${max}`);
    return defaultValue;
  }
  return candidate;
};

const normalizeStringArray = (value, path, issues, maxItems, maxLength = 500) => {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    issues.push(`${path} must be an array`);
    return [];
  }
  if (value.length > maxItems) issues.push(`${path} exceeds ${maxItems} items`);

  const result = [];
  for (const [index, item] of value.slice(0, maxItems).entries()) {
    const normalized = boundedString(item, `${path}[${index}]`, issues, {
      required: true,
      max: maxLength
    });
    if (normalized && !result.includes(normalized)) result.push(normalized);
  }
  return result;
};

const normalizeJsonValue = (value, path, issues) => {
  if (
    value == null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      normalizeJsonValue(item, `${path}[${index}]`, issues)
    );
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        normalizeJsonValue(item, `${path}.${key}`, issues)
      ])
    );
  }
  issues.push(`${path} must contain only JSON-compatible values`);
  return null;
};

const normalizeTestValue = (value, path, issues) => {
  const normalized = normalizeJsonValue(value, path, issues);
  let serialized = '';
  try {
    serialized = typeof normalized === 'string'
      ? normalized
      : JSON.stringify(normalized);
  } catch {
    issues.push(`${path} is not serializable`);
  }
  if ((serialized?.length || 0) > PROBLEM_LIMITS.testValue) {
    issues.push(`${path} exceeds ${PROBLEM_LIMITS.testValue} characters`);
  }
  return normalized;
};

const normalizeTests = (value, path, issues) => {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    issues.push(`${path} must be an array`);
    return [];
  }
  if (value.length > PROBLEM_LIMITS.testsPerVisibility) {
    issues.push(
      `${path} exceeds ${PROBLEM_LIMITS.testsPerVisibility} test cases`
    );
  }

  return value
    .slice(0, PROBLEM_LIMITS.testsPerVisibility)
    .map((item, index) => {
      const test = ensurePlainObject(item, `${path}[${index}]`, issues);
      const unexpected = Object.keys(test).filter(
        (key) => !['input', 'expectedOutput', 'description', 'metadata'].includes(key)
      );
      if (unexpected.length) {
        issues.push(`${path}[${index}] has unknown keys: ${unexpected.join(', ')}`);
      }
      if (!Object.hasOwn(test, 'input')) {
        issues.push(`${path}[${index}].input is required`);
      }
      if (!Object.hasOwn(test, 'expectedOutput')) {
        issues.push(`${path}[${index}].expectedOutput is required`);
      }
      return {
        input: normalizeTestValue(test.input, `${path}[${index}].input`, issues),
        expectedOutput: normalizeTestValue(
          test.expectedOutput,
          `${path}[${index}].expectedOutput`,
          issues
        ),
        ...(test.description == null
          ? {}
          : {
              description: boundedString(
                test.description,
                `${path}[${index}].description`,
                issues,
                { max: 1_000 }
              )
            }),
        ...(test.metadata == null
          ? {}
          : {
              metadata: normalizeJsonValue(
                test.metadata,
                `${path}[${index}].metadata`,
                issues
              )
            })
      };
    });
};

const normalizeExamples = (value, issues) => {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    issues.push('examples must be an array');
    return [];
  }
  if (value.length > PROBLEM_LIMITS.examples) {
    issues.push(`examples exceeds ${PROBLEM_LIMITS.examples} items`);
  }
  return value.slice(0, PROBLEM_LIMITS.examples).map((item, index) => {
    const example = ensurePlainObject(item, `examples[${index}]`, issues);
    if (!Object.hasOwn(example, 'input')) {
      issues.push(`examples[${index}].input is required`);
    }
    if (
      !Object.hasOwn(example, 'output') &&
      !Object.hasOwn(example, 'expectedOutput')
    ) {
      issues.push(`examples[${index}].output is required`);
    }
    return {
      input: normalizeTestValue(example.input, `examples[${index}].input`, issues),
      output: normalizeTestValue(
        example.output ?? example.expectedOutput,
        `examples[${index}].output`,
        issues
      ),
      ...(example.explanation == null
        ? {}
        : {
            explanation: boundedString(
              example.explanation,
              `examples[${index}].explanation`,
              issues,
              { max: 2_000 }
            )
          })
    };
  });
};

const normalizeStarterCode = (value, issues) => {
  if (value == null) return {};
  const object = ensurePlainObject(value, 'starterCode', issues);
  const entries = Object.entries(object);
  if (entries.length > PROBLEM_LIMITS.starterLanguages) {
    issues.push(
      `starterCode exceeds ${PROBLEM_LIMITS.starterLanguages} languages`
    );
  }
  const result = {};
  for (const [language, code] of entries.slice(0, PROBLEM_LIMITS.starterLanguages)) {
    const normalizedLanguage = String(language).trim().toLowerCase();
    if (!LANGUAGE_PATTERN.test(normalizedLanguage)) {
      issues.push(`starterCode has invalid language key: ${language}`);
      continue;
    }
    if (typeof code !== 'string') {
      issues.push(`starterCode.${normalizedLanguage} must be a string`);
      continue;
    }
    if (code.length > PROBLEM_LIMITS.starterCode) {
      issues.push(
        `starterCode.${normalizedLanguage} exceeds ${PROBLEM_LIMITS.starterCode} characters`
      );
    }
    result[normalizedLanguage] = code;
  }
  return result;
};

export const slugifyProblemTitle = (title) =>
  String(title || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, PROBLEM_LIMITS.slug)
    .replace(/-+$/g, '');

export const normalizeProblem = (input) => {
  const issues = [];
  const source = ensurePlainObject(input, 'problem', issues);
  const unknownKeys = Object.keys(source).filter((key) => !ALLOWED_KEYS.has(key));
  if (unknownKeys.length) issues.push(`unknown keys: ${unknownKeys.join(', ')}`);
  if (
    source.id != null &&
    !(
      (Number.isSafeInteger(source.id) && source.id >= 0) ||
      (typeof source.id === 'string' &&
        source.id.length > 0 &&
        source.id.length <= 200)
    )
  ) {
    issues.push('id must be a non-negative integer or a non-empty bounded string');
  }

  const title = boundedString(source.title, 'title', issues, {
    required: true,
    max: PROBLEM_LIMITS.title
  });
  const slug = boundedString(source.slug ?? slugifyProblemTitle(title), 'slug', issues, {
    required: true,
    max: PROBLEM_LIMITS.slug
  }).toLowerCase();
  if (slug && !SLUG_PATTERN.test(slug)) {
    issues.push('slug must contain lowercase letters, numbers, and single hyphens');
  }

  const statement = boundedString(
    source.statement ?? source.description,
    'statement',
    issues,
    { required: true, max: PROBLEM_LIMITS.statement }
  );
  const difficulty = boundedString(source.difficulty, 'difficulty', issues, {
    required: true,
    max: 20
  }).toLowerCase();
  if (difficulty && !DIFFICULTIES.has(difficulty)) {
    issues.push('difficulty must be easy, medium, or hard');
  }

  const topic = boundedString(
    source.topic ?? source.tags?.[0] ?? 'general',
    'topic',
    issues,
    { required: true, max: 80 }
  ).toLowerCase();
  const tags = normalizeStringArray(
    source.tags ?? [topic],
    'tags',
    issues,
    PROBLEM_LIMITS.tags,
    80
  ).map((tag) => tag.toLowerCase());

  const starterCode = normalizeStarterCode(source.starterCode, issues);
  const starterLanguages = Object.keys(starterCode);
  const supportedLanguages = normalizeStringArray(
    source.supportedLanguages ??
      (starterLanguages.length > 0
        ? starterLanguages
        : DEFAULT_SUPPORTED_LANGUAGES),
    'supportedLanguages',
    issues,
    PROBLEM_LIMITS.starterLanguages,
    32
  ).map((language) => language.toLowerCase());
  for (const language of supportedLanguages) {
    if (!LANGUAGE_PATTERN.test(language)) {
      issues.push(`supportedLanguages contains invalid language: ${language}`);
    }
  }
  for (const language of starterLanguages) {
    if (!supportedLanguages.includes(language)) {
      issues.push(`starterCode.${language} is not in supportedLanguages`);
    }
  }

  const visibleTests = normalizeTests(
    source.visibleTests ?? source.testCases,
    'visibleTests',
    issues
  );
  const hiddenTests = normalizeTests(source.hiddenTests, 'hiddenTests', issues);
  if (visibleTests.length + hiddenTests.length === 0) {
    issues.push('at least one visible or hidden test is required');
  }

  const rawMetadata = ensurePlainObject(source.metadata ?? {}, 'metadata', issues);
  const metadata = normalizeJsonValue(
    rawMetadata,
    'metadata',
    issues
  );
  const metadataBytes = Buffer.byteLength(JSON.stringify(metadata ?? {}), 'utf8');
  if (metadataBytes > PROBLEM_LIMITS.metadataBytes) {
    issues.push(`metadata exceeds ${PROBLEM_LIMITS.metadataBytes} bytes`);
  }

  const normalized = {
    ...(source.id == null ? {} : { id: source.id }),
    title,
    slug,
    statement,
    description: statement,
    explanation: boundedString(source.explanation, 'explanation', issues, {
      max: PROBLEM_LIMITS.explanation
    }),
    examples: normalizeExamples(source.examples, issues),
    constraints: normalizeStringArray(
      source.constraints,
      'constraints',
      issues,
      PROBLEM_LIMITS.constraints,
      1_000
    ),
    difficulty,
    topic,
    tags,
    starterCode,
    supportedLanguages,
    visibleTests,
    hiddenTests,
    edgeCases: normalizeStringArray(
      source.edgeCases,
      'edgeCases',
      issues,
      PROBLEM_LIMITS.edgeCases,
      1_000
    ),
    timeLimitMs: boundedInteger(
      source.timeLimitMs ?? source.timeLimit,
      'timeLimitMs',
      issues,
      { min: 100, max: PROBLEM_LIMITS.timeLimitMs, defaultValue: 5_000 }
    ),
    memoryLimitMb: boundedInteger(
      source.memoryLimitMb ?? source.memoryLimit,
      'memoryLimitMb',
      issues,
      { min: 16, max: PROBLEM_LIMITS.memoryLimitMb, defaultValue: 128 }
    ),
    metadata,
    version: boundedString(String(source.version ?? '1'), 'version', issues, {
      required: true,
      max: 80
    })
  };

  if (issues.length) throw new ProblemValidationError(issues);
  return normalized;
};

export const validateProblem = (input) => {
  try {
    return { success: true, data: normalizeProblem(input), issues: [] };
  } catch (error) {
    if (error instanceof ProblemValidationError) {
      return { success: false, data: null, issues: error.issues };
    }
    throw error;
  }
};
