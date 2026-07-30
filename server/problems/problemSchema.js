import { ValidationError } from '../errors/index.js';

/** @typedef {string | number | boolean | null | undefined | JsonArray | JsonObject} JsonValue */
/** @typedef {JsonValue[]} JsonArray */
/** @typedef {{ [key: string]: JsonValue }} JsonObject */
/** @typedef {{ input: JsonValue, expectedOutput: JsonValue, description?: string, metadata?: JsonValue }} NormalizedTest */
/** @typedef {{ input: JsonValue, output: JsonValue, explanation?: string }} NormalizedExample */
/** @typedef {'LICENSED' | 'RESTRICTED_METADATA_ONLY'} ProvenanceState */
/** @typedef {{ state: ProvenanceState, attribution?: string, canonicalUrl?: string }} ProblemProvenance */
/** @typedef {{
 *   id?: string | number,
 *   title: string,
 *   slug: string,
 *   statement: string,
 *   description: string,
 *   inputFormat: string,
 *   outputFormat: string,
 *   explanation: string,
 *   notes: string,
 *   hints: string[],
 *   editorial: string,
 *   examples: NormalizedExample[],
 *   constraints: string[],
 *   difficulty: string,
 *   topic: string,
 *   tags: string[],
 *   starterCode: Record<string, string>,
 *   supportedLanguages: string[],
 *   visibleTests: NormalizedTest[],
 *   hiddenTests: NormalizedTest[],
 *   edgeCases: string[],
 *   timeLimitMs: number,
 *   memoryLimitMb: number,
 *   maxSourceSizeBytes: number,
 *   estimatedSolveTimeMinutes: number,
 *   visibility: 'public' | 'private' | 'unlisted',
 *   status: 'draft' | 'published' | 'archived',
 *   authorId: string | null,
 *   createdAt: string | null,
 *   updatedAt: string | null,
 *   metadata: JsonObject,
 *   provenance: ProblemProvenance,
 *   version: string
 * }} NormalizedProblem */

const DIFFICULTIES = new Set(['easy', 'medium', 'hard', 'very-hard']);
const VISIBILITIES = new Set(['public', 'private', 'unlisted']);
const STATUSES = new Set(['draft', 'published', 'archived']);
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
  format: 20_000,
  explanation: 50_000,
  notes: 20_000,
  hints: 20,
  editorial: 100_000,
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
  memoryLimitMb: 1_024,
  maxSourceSizeBytes: 1_048_576,
  estimatedSolveTimeMinutes: 480
});

const ALLOWED_KEYS = new Set([
  'id',
  'title',
  'slug',
  'statement',
  'description',
  'inputFormat',
  'outputFormat',
  'explanation',
  'notes',
  'hints',
  'editorial',
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
  'maxSourceSize',
  'maxSourceSizeBytes',
  'estimatedSolveTimeMinutes',
  'visibility',
  'status',
  'authorId',
  'createdAt',
  'updatedAt',
  'metadata',
  'provenance',
  'version'
]);

export const RESTRICTED_METADATA_ONLY = 'RESTRICTED_METADATA_ONLY';
export const LICENSED_PROVENANCE = 'LICENSED';

export class ProblemValidationError extends ValidationError {
  /** @param {string | string[]} issues */
  constructor(issues) {
    const normalizedIssues = Array.isArray(issues) ? issues : [String(issues)];
    super(`Invalid problem: ${normalizedIssues.join('; ')}`, {
      code: 'INVALID_PROBLEM',
      details: { issues: normalizedIssues }
    });
    this.name = 'ProblemValidationError';
    this.issues = normalizedIssues;
  }
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
const isPlainObject = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

/** @param {unknown} value @param {string} path @param {string[]} issues @returns {Record<string, unknown>} */
const ensurePlainObject = (value, path, issues) => {
  if (!isPlainObject(value)) {
    issues.push(`${path} must be a plain object`);
    return {};
  }
  return value;
};

/**
 * @param {unknown} value
 * @param {string} path
 * @param {string[]} issues
 * @param {{ required?: boolean, max?: number, defaultValue?: string }} [options]
 * @returns {string}
 */
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

/**
 * @param {unknown} value
 * @param {string} path
 * @param {string[]} issues
 * @param {{ min: number, max: number, defaultValue: number }} options
 * @returns {number}
 */
const boundedInteger = (
  value,
  path,
  issues,
  { min, max, defaultValue }
) => {
  const candidate = value == null ? defaultValue : value;
  if (
    typeof candidate !== 'number' ||
    !Number.isSafeInteger(candidate) ||
    candidate < min ||
    candidate > max
  ) {
    issues.push(`${path} must be an integer between ${min} and ${max}`);
    return defaultValue;
  }
  return candidate;
};

/**
 * Restricted records retain only rights-safe metadata for public use. The
 * canonical URL is required so consumers can navigate to the source instead
 * of receiving the copyrighted statement from this service.
 * @param {unknown} value
 * @param {string[]} issues
 * @returns {ProblemProvenance}
 */
const normalizeProvenance = (value, issues) => {
  if (value == null) return { state: LICENSED_PROVENANCE };
  const source = ensurePlainObject(value, 'provenance', issues);
  const unexpected = Object.keys(source).filter(
    (key) => !['state', 'attribution', 'canonicalUrl'].includes(key)
  );
  if (unexpected.length) {
    issues.push(`provenance has unknown keys: ${unexpected.join(', ')}`);
  }
  const state = boundedString(source.state, 'provenance.state', issues, {
    required: true,
    max: 64
  }).toUpperCase();
  if (state !== LICENSED_PROVENANCE && state !== RESTRICTED_METADATA_ONLY) {
    issues.push('provenance.state must be LICENSED or RESTRICTED_METADATA_ONLY');
  }
  if (state !== RESTRICTED_METADATA_ONLY) {
    return { state: LICENSED_PROVENANCE };
  }

  const attribution = boundedString(
    source.attribution,
    'provenance.attribution',
    issues,
    { required: true, max: 2_000 }
  );
  const canonicalUrl = boundedString(
    source.canonicalUrl,
    'provenance.canonicalUrl',
    issues,
    { required: true, max: 2_048 }
  );
  try {
    const url = new URL(canonicalUrl);
    if (url.protocol !== 'https:') {
      issues.push('provenance.canonicalUrl must use https');
    }
  } catch {
    issues.push('provenance.canonicalUrl must be a valid URL');
  }
  return {
    state: RESTRICTED_METADATA_ONLY,
    attribution,
    canonicalUrl
  };
};

/** @param {ProblemProvenance | undefined} provenance */
export const isRestrictedMetadataOnly = (provenance) =>
  provenance?.state === RESTRICTED_METADATA_ONLY;

/**
 * @param {unknown} value
 * @param {string} path
 * @param {string[]} issues
 * @param {number} maxItems
 * @param {number} [maxLength]
 * @returns {string[]}
 */
const normalizeStringArray = (value, path, issues, maxItems, maxLength = 500) => {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    issues.push(`${path} must be an array`);
    return [];
  }
  if (value.length > maxItems) issues.push(`${path} exceeds ${maxItems} items`);

  /** @type {string[]} */
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

/**
 * @param {unknown} value
 * @param {string} path
 * @param {string[]} issues
 * @returns {JsonValue}
 */
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
    return /** @type {JsonObject} */ (Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        normalizeJsonValue(item, `${path}.${key}`, issues)
      ])
    ));
  }
  issues.push(`${path} must contain only JSON-compatible values`);
  return null;
};

/** @param {unknown} value @param {string} path @param {string[]} issues @returns {JsonValue} */
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

/** @param {unknown} value @param {string} path @param {string[]} issues @returns {NormalizedTest[]} */
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

/** @param {unknown} value @param {string[]} issues @returns {NormalizedExample[]} */
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

/** @param {unknown} value @param {string[]} issues @returns {Record<string, string>} */
const normalizeStarterCode = (value, issues) => {
  if (value == null) return {};
  const object = ensurePlainObject(value, 'starterCode', issues);
  const entries = Object.entries(object);
  if (entries.length > PROBLEM_LIMITS.starterLanguages) {
    issues.push(
      `starterCode exceeds ${PROBLEM_LIMITS.starterLanguages} languages`
    );
  }
  /** @type {Record<string, string>} */
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

/** @param {unknown} title @returns {string} */
export const slugifyProblemTitle = (title) =>
  String(title || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, PROBLEM_LIMITS.slug)
    .replace(/-+$/g, '');

/** @param {unknown} input @returns {NormalizedProblem} */
export const normalizeProblem = (input) => {
  /** @type {string[]} */
  const issues = [];
  const source = ensurePlainObject(input, 'problem', issues);
  const unknownKeys = Object.keys(source).filter((key) => !ALLOWED_KEYS.has(key));
  if (unknownKeys.length) issues.push(`unknown keys: ${unknownKeys.join(', ')}`);
  const rawId = source.id;
  if (
    rawId != null &&
    !(
      (typeof rawId === 'number' && Number.isSafeInteger(rawId) && rawId >= 0) ||
      (typeof rawId === 'string' && rawId.length > 0 && rawId.length <= 200)
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

  const provenance = normalizeProvenance(source.provenance, issues);

  const statement = boundedString(
    source.statement ?? source.description,
    'statement',
    issues,
    {
      required: !isRestrictedMetadataOnly(provenance),
      max: PROBLEM_LIMITS.statement
    }
  );
  const difficulty = boundedString(source.difficulty, 'difficulty', issues, {
    required: true,
    max: 20
  }).toLowerCase();
  if (difficulty && !DIFFICULTIES.has(difficulty)) {
    issues.push('difficulty must be easy, medium, hard, or very-hard');
  }

  const visibility = boundedString(
    source.visibility,
    'visibility',
    issues,
    { defaultValue: 'public', max: 16 }
  ).toLowerCase();
  if (!VISIBILITIES.has(visibility)) {
    issues.push('visibility must be public, private, or unlisted');
  }
  const status = boundedString(
    source.status,
    'status',
    issues,
    { defaultValue: 'published', max: 16 }
  ).toLowerCase();
  if (!STATUSES.has(status)) {
    issues.push('status must be draft, published, or archived');
  }

  const firstTag = Array.isArray(source.tags) ? source.tags[0] : undefined;
  const topic = boundedString(
    source.topic ?? firstTag ?? 'general',
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
  if (isRestrictedMetadataOnly(provenance) && hiddenTests.length > 0) {
    issues.push('restricted metadata-only problems cannot include hiddenTests');
  }
  if (
    !isRestrictedMetadataOnly(provenance) &&
    status !== 'draft' &&
    visibleTests.length + hiddenTests.length === 0
  ) {
    issues.push('at least one visible or hidden test is required');
  }

  const rawMetadata = ensurePlainObject(source.metadata ?? {}, 'metadata', issues);
  const metadata = /** @type {JsonObject} */ (normalizeJsonValue(
    rawMetadata,
    'metadata',
    issues
  ));
  const metadataBytes = Buffer.byteLength(JSON.stringify(metadata ?? {}), 'utf8');
  if (metadataBytes > PROBLEM_LIMITS.metadataBytes) {
    issues.push(`metadata exceeds ${PROBLEM_LIMITS.metadataBytes} bytes`);
  }

  /** @type {NormalizedProblem} */
  const normalized = {
    ...(rawId == null ? {} : { id: /** @type {string | number} */ (rawId) }),
    title,
    slug,
    statement,
    description: statement,
    inputFormat: boundedString(source.inputFormat, 'inputFormat', issues, {
      max: PROBLEM_LIMITS.format
    }),
    outputFormat: boundedString(source.outputFormat, 'outputFormat', issues, {
      max: PROBLEM_LIMITS.format
    }),
    explanation: boundedString(source.explanation, 'explanation', issues, {
      max: PROBLEM_LIMITS.explanation
    }),
    notes: boundedString(source.notes, 'notes', issues, {
      max: PROBLEM_LIMITS.notes
    }),
    hints: normalizeStringArray(
      source.hints,
      'hints',
      issues,
      PROBLEM_LIMITS.hints,
      2_000
    ),
    editorial: boundedString(source.editorial, 'editorial', issues, {
      max: PROBLEM_LIMITS.editorial
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
    maxSourceSizeBytes: boundedInteger(
      source.maxSourceSizeBytes ?? source.maxSourceSize,
      'maxSourceSizeBytes',
      issues,
      {
        min: 1_024,
        max: PROBLEM_LIMITS.maxSourceSizeBytes,
        defaultValue: 65_536
      }
    ),
    estimatedSolveTimeMinutes: boundedInteger(
      source.estimatedSolveTimeMinutes,
      'estimatedSolveTimeMinutes',
      issues,
      {
        min: 1,
        max: PROBLEM_LIMITS.estimatedSolveTimeMinutes,
        defaultValue: difficulty === 'easy'
          ? 15
          : difficulty === 'medium'
            ? 30
            : difficulty === 'hard'
              ? 50
              : 75
      }
    ),
    visibility: /** @type {'public' | 'private' | 'unlisted'} */ (visibility),
    status: /** @type {'draft' | 'published' | 'archived'} */ (status),
    authorId: source.authorId == null
      ? null
      : boundedString(source.authorId, 'authorId', issues, {
          required: true,
          max: 128
        }),
    createdAt: source.createdAt == null
      ? null
      : boundedString(source.createdAt, 'createdAt', issues, {
          required: true,
          max: 64
        }),
    updatedAt: source.updatedAt == null
      ? null
      : boundedString(source.updatedAt, 'updatedAt', issues, {
          required: true,
          max: 64
        }),
    metadata,
    provenance,
    version: boundedString(String(source.version ?? '1'), 'version', issues, {
      required: true,
      max: 80
    })
  };

  if (issues.length) throw new ProblemValidationError(issues);
  return normalized;
};

/** @param {unknown} input @returns {{ success: true, data: NormalizedProblem, issues: string[] } | { success: false, data: null, issues: string[] }} */
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
