/** @typedef {import('../problems/problemProjection.js').PublicProblem} PublicProblem */
/** @typedef {import('../problems/problemProjection.js').JudgeProblem} JudgeProblem */
/** @typedef {{ search?: string, topic?: string, difficulty?: string, language?: string, tag?: string, solved?: string, userId?: string, sort?: string, limit?: number, cursor?: string | null }} ProblemListQuery */
/** @typedef {{ items: PublicProblem[], nextCursor: string | null, total: number }} ProblemListResult */
/** @typedef {{
 *   getRandomProblem: (topicOrFilter?: string | ProblemListQuery) => Promise<PublicProblem | null>,
 *   getBySlug: (slug: string) => Promise<PublicProblem | null>,
 *   getJudgeProblem: (slug: string) => Promise<JudgeProblem | null>,
 *   listProblems: (query?: ProblemListQuery) => Promise<ProblemListResult>
 * }} ProblemProvider */

export const PROBLEM_PROVIDER_METHODS = Object.freeze([
  'getRandomProblem',
  'getBySlug',
  'getJudgeProblem',
  'listProblems'
]);

/** @param {unknown} provider @param {string} [name] @returns {ProblemProvider} */
export const assertProblemProvider = (provider, name = 'provider') => {
  if (!provider || typeof provider !== 'object') {
    throw new TypeError(`${name} must be an object`);
  }
  const candidate = /** @type {Record<string, unknown>} */ (provider);
  for (const method of PROBLEM_PROVIDER_METHODS) {
    if (typeof candidate[method] !== 'function') {
      throw new TypeError(`${name}.${method} must be a function`);
    }
  }
  return /** @type {ProblemProvider} */ (provider);
};
