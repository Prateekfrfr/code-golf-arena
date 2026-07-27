import { normalizeProblem } from '../problems/problemSchema.js';
import {
  toJudgeProblem,
  toPublicProblem
} from '../problems/problemProjection.js';

/** @typedef {import('../problems/problemSchema.js').NormalizedProblem} NormalizedProblem */
/** @typedef {import('../problems/problemProjection.js').PublicProblem} PublicProblem */
/** @typedef {import('../problems/problemProjection.js').JudgeProblem} JudgeProblem */
/** @typedef {import('./problemProvider.js').ProblemListQuery} ProblemListQuery */
/** @typedef {{ problem: NormalizedProblem } | NormalizedProblem} ProblemRecord */
/** @typedef {{ items: ProblemRecord[], nextCursor: string | null, total: number }} RepositoryListResult */
/** @typedef {{
 *   getBySlug: (slug: string, options?: { includeHidden?: boolean }) => Promise<ProblemRecord | null>,
 *   listProblems: (query: Required<ProblemListQuery>) => Promise<ProblemRecord[] | RepositoryListResult>,
 *   getRandomProblem?: (query: Required<ProblemListQuery>) => Promise<ProblemRecord | null>
 * }} ProblemRepository */
/** @typedef {{
 *   getRandomProblem: (topicOrFilter?: string | Partial<ProblemListQuery>) => Promise<PublicProblem | null>,
 *   getBySlug: (slug: string) => Promise<PublicProblem | null>,
 *   getJudgeProblem: (slug: string) => Promise<JudgeProblem | null>,
 *   listProblems: (query?: ProblemListQuery) => Promise<{ items: PublicProblem[], nextCursor: string | null, total: number }>,
 *   refresh: () => Promise<{ changed: boolean }>
 * }} DatabaseProblemProvider */

/** @param {unknown} repository @returns {asserts repository is ProblemRepository} */
const assertRepository = (repository) => {
  const candidate = repository && typeof repository === 'object'
    ? /** @type {Record<string, unknown>} */ (repository)
    : null;
  for (const method of ['getBySlug', 'listProblems']) {
    if (typeof candidate?.[method] !== 'function') {
      throw new TypeError(`repository.${method} must be a function`);
    }
  }
};

/** @param {Partial<ProblemListQuery>} [query] @returns {Required<ProblemListQuery>} */
const normalizeQuery = (query = {}) => {
  const cursor = query.cursor == null ? null : String(query.cursor);
  if (cursor && cursor.length > 512) throw new Error('cursor exceeds 512 characters');
  return {
    search: String(query.search || '').trim().slice(0, 200),
    topic: String(query.topic || '').trim().toLowerCase().slice(0, 80),
    difficulty: String(query.difficulty || '').trim().toLowerCase().slice(0, 20),
    language: String(query.language || '').trim().toLowerCase().slice(0, 32),
    tag: String(query.tag || '').trim().toLowerCase().slice(0, 80),
    solved: String(query.solved || '').trim().toLowerCase().slice(0, 16),
    userId: String(query.userId || '').trim().toLowerCase().slice(0, 64),
    sort: String(query.sort || 'slug').trim().toLowerCase().slice(0, 32),
    limit: Math.min(100, Math.max(1, Number(query.limit) || 20)),
    cursor
  };
};

/** @param {ProblemRecord} record @returns {NormalizedProblem} */
const unwrapProblemRecord = (record) => 'problem' in record ? record.problem : record;

/**
 * @param {{ repository: ProblemRepository, random?: () => number }} options
 * @returns {DatabaseProblemProvider}
 */
export const createDatabaseProblemProvider = ({
  repository,
  random = Math.random
}) => {
  assertRepository(repository);

  return /** @type {DatabaseProblemProvider} */ ({
    async getRandomProblem(topicOrFilter) {
      const filter =
        typeof topicOrFilter === 'object' && topicOrFilter !== null
          ? topicOrFilter
          : { topic: String(topicOrFilter || '').trim().toLowerCase() };
      const query = normalizeQuery(filter);
      if (typeof repository.getRandomProblem === 'function') {
        const record = await repository.getRandomProblem(query);
        return record ? toPublicProblem(unwrapProblemRecord(record)) : null;
      }
      const result = await repository.listProblems({ ...query, limit: 100 });
      const records = Array.isArray(result) ? result : result.items;
      if (records.length === 0) return null;
      const index = Math.min(
        records.length - 1,
        Math.max(0, Math.floor(random() * records.length))
      );
      return toPublicProblem(unwrapProblemRecord(records[index]));
    },

    async getBySlug(slug) {
      const record = await repository.getBySlug(slug, { includeHidden: false });
      return record ? toPublicProblem(unwrapProblemRecord(record)) : null;
    },

    async getJudgeProblem(slug) {
      const record = await repository.getBySlug(slug, { includeHidden: true });
      return record ? toJudgeProblem(unwrapProblemRecord(record)) : null;
    },

    async listProblems(query = {}) {
      const result = await repository.listProblems(normalizeQuery(query));
      const records = Array.isArray(result) ? result : result.items;
      const items = records.map((record) =>
        toPublicProblem(normalizeProblem(unwrapProblemRecord(record)))
      );
      return Array.isArray(result) ? { items, nextCursor: null, total: items.length } : {
        ...result,
        items
      };
    },

    async refresh() {
      return { changed: false };
    }
  });
};
