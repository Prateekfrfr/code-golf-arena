import {
  isRestrictedMetadataOnly,
  normalizeProblem,
  RESTRICTED_METADATA_ONLY
} from './problemSchema.js';
import { ValidationError } from '../errors/index.js';

/** @typedef {import('./problemSchema.js').JsonValue} JsonValue */
/** @typedef {import('./problemSchema.js').JsonObject} JsonObject */
/** @typedef {import('./problemSchema.js').NormalizedProblem} NormalizedProblem */
/** @typedef {{
 *   id?: string | number,
 *   title: string,
 *   slug: string,
 *   statement: string,
 *   description: string,
 *   explanation: string,
 *   examples: NormalizedProblem['examples'],
 *   constraints: string[],
 *   difficulty: string,
 *   topic: string,
 *   tags: string[],
 *   starterCode: Record<string, string>,
 *   supportedLanguages: string[],
 *   visibleTests: NormalizedProblem['visibleTests'],
 *   testCases: NormalizedProblem['visibleTests'],
 *   edgeCases: string[],
 *   timeLimitMs: number,
 *   memoryLimitMb: number,
 *   metadata: JsonObject,
 *   version: string
 * }} LicensedPublicProblem */
/** @typedef {{
 *   id?: string | number,
 *   title: string,
 *   slug: string,
 *   difficulty: string,
 *   topic: string,
 *   tags: string[],
 *   supportedLanguages: string[],
 *   attribution: string,
 *   canonicalUrl: string,
 *   provenance: { state: 'RESTRICTED_METADATA_ONLY', attribution: string, canonicalUrl: string },
 *   version: string
 * }} RestrictedMetadataProblem */
/** @typedef {LicensedPublicProblem | RestrictedMetadataProblem} PublicProblem */
/** @typedef {LicensedPublicProblem & { testCases: NormalizedProblem['visibleTests'] }} JudgeProblem */

/**
 * @template T
 * @param {T} value
 * @returns {T}
 */
const cloneJson = (value) => /** @type {T} */ (JSON.parse(JSON.stringify(value)));

/** @param {unknown} input @returns {PublicProblem} */
export const toPublicProblem = (input) => {
  const problem = normalizeProblem(input);
  if (isRestrictedMetadataOnly(problem.provenance)) {
    const { attribution = '', canonicalUrl = '' } = problem.provenance;
    return {
      ...(problem.id == null ? {} : { id: problem.id }),
      title: problem.title,
      slug: problem.slug,
      difficulty: problem.difficulty,
      topic: problem.topic,
      tags: [...problem.tags],
      supportedLanguages: [...problem.supportedLanguages],
      attribution,
      canonicalUrl,
      provenance: {
        state: RESTRICTED_METADATA_ONLY,
        attribution,
        canonicalUrl
      },
      version: problem.version
    };
  }
  const visibleTests = cloneJson(problem.visibleTests);
  const publicMetadata =
    problem.metadata?.public &&
    typeof problem.metadata.public === 'object' &&
    !Array.isArray(problem.metadata.public)
      ? cloneJson(/** @type {JsonObject} */ (problem.metadata.public))
      : {};

  return /** @type {LicensedPublicProblem} */ ({
    ...(problem.id == null ? {} : { id: problem.id }),
    title: problem.title,
    slug: problem.slug,
    statement: problem.statement,
    description: problem.description,
    explanation: problem.explanation,
    examples: cloneJson(problem.examples),
    constraints: [...problem.constraints],
    difficulty: problem.difficulty,
    topic: problem.topic,
    tags: [...problem.tags],
    starterCode: cloneJson(problem.starterCode),
    supportedLanguages: [...problem.supportedLanguages],
    visibleTests,
    testCases: visibleTests,
    edgeCases: [...problem.edgeCases],
    timeLimitMs: problem.timeLimitMs,
    memoryLimitMb: problem.memoryLimitMb,
    metadata: publicMetadata,
    version: problem.version
  });
};

/** @param {unknown} input @returns {JudgeProblem} */
export const toJudgeProblem = (input) => {
  const problem = normalizeProblem(input);
  if (isRestrictedMetadataOnly(problem.provenance)) {
    throw new ValidationError(
      `Problem ${problem.slug} is restricted to metadata-only provenance and cannot be judged`,
      {
        code: 'RESTRICTED_PROBLEM_NOT_JUDGEABLE',
        details: { slug: problem.slug }
      }
    );
  }
  const publicProblem = /** @type {LicensedPublicProblem} */ (toPublicProblem(problem));
  return {
    ...publicProblem,
    testCases: cloneJson([...problem.visibleTests, ...problem.hiddenTests])
  };
};
