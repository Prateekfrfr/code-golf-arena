import { normalizeProblem } from '../problems/problemSchema.js';
import {
  toJudgeProblem,
  toPublicProblem
} from '../problems/problemProjection.js';

const assertRepository = (repository) => {
  for (const method of ['getBySlug', 'listProblems']) {
    if (typeof repository?.[method] !== 'function') {
      throw new TypeError(`repository.${method} must be a function`);
    }
  }
};

const normalizeQuery = (query = {}) => {
  const cursor = query.cursor == null ? null : String(query.cursor);
  if (cursor && cursor.length > 512) throw new Error('cursor exceeds 512 characters');
  return {
    search: String(query.search || '').trim().slice(0, 200),
    topic: String(query.topic || '').trim().toLowerCase().slice(0, 80),
    difficulty: String(query.difficulty || '').trim().toLowerCase().slice(0, 20),
    language: String(query.language || '').trim().toLowerCase().slice(0, 32),
    tag: String(query.tag || '').trim().toLowerCase().slice(0, 80),
    sort: String(query.sort || 'slug').trim().toLowerCase().slice(0, 32),
    limit: Math.min(100, Math.max(1, Number(query.limit) || 20)),
    cursor
  };
};

export const createDatabaseProblemProvider = ({
  repository,
  random = Math.random
}) => {
  assertRepository(repository);

  return {
    async getRandomProblem(topicOrFilter) {
      const filter =
        typeof topicOrFilter === 'object' && topicOrFilter !== null
          ? topicOrFilter
          : { topic: String(topicOrFilter || '').trim().toLowerCase() };
      const query = normalizeQuery(filter);
      if (typeof repository.getRandomProblem === 'function') {
        const record = await repository.getRandomProblem(query);
        return record ? toPublicProblem(record) : null;
      }
      const result = await repository.listProblems({ ...query, limit: 100 });
      const records = Array.isArray(result) ? result : result.items;
      if (!records?.length) return null;
      const index = Math.min(
        records.length - 1,
        Math.max(0, Math.floor(random() * records.length))
      );
      return toPublicProblem(records[index]);
    },

    async getBySlug(slug) {
      const record = await repository.getBySlug(slug, { includeHidden: false });
      return record ? toPublicProblem(record) : null;
    },

    async getJudgeProblem(slug) {
      const record = await repository.getBySlug(slug, { includeHidden: true });
      return record ? toJudgeProblem(record) : null;
    },

    async listProblems(query = {}) {
      const result = await repository.listProblems(normalizeQuery(query));
      const records = Array.isArray(result) ? result : result.items;
      const items = records.map((record) => toPublicProblem(normalizeProblem(record)));
      return Array.isArray(result) ? { items, nextCursor: null, total: items.length } : {
        ...result,
        items
      };
    },

    async refresh() {
      return { changed: false };
    }
  };
};
