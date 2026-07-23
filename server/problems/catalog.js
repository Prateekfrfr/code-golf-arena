import { toJudgeProblem, toPublicProblem } from './problemProjection.js';
import { normalizeProblem } from './problemSchema.js';

const normalizeQuery = (query = {}) => ({
  search: String(query.search || '').trim().toLowerCase(),
  topic: String(query.topic || '').trim().toLowerCase(),
  difficulty: String(query.difficulty || '').trim().toLowerCase(),
  language: String(query.language || '').trim().toLowerCase(),
  tag: String(query.tag || '').trim().toLowerCase(),
  limit: Math.min(100, Math.max(1, Number(query.limit) || 20)),
  cursor: Math.max(0, Number(query.cursor) || 0)
});

export const createProblemCatalog = (records) => {
  const problems = records.map(normalizeProblem);
  const bySlug = new Map();
  for (const problem of problems) {
    if (bySlug.has(problem.slug)) {
      throw new Error(`Duplicate problem slug: ${problem.slug}`);
    }
    bySlug.set(problem.slug, problem);
  }

  const select = (query = {}) => {
    const normalized = normalizeQuery(query);
    return problems
      .filter((problem) => {
        if (
          normalized.search &&
          !`${problem.title} ${problem.statement} ${problem.tags.join(' ')}`
            .toLowerCase()
            .includes(normalized.search)
        ) {
          return false;
        }
        if (
          normalized.topic &&
          normalized.topic !== 'random' &&
          problem.topic !== normalized.topic
        ) {
          return false;
        }
        if (
          normalized.difficulty &&
          problem.difficulty !== normalized.difficulty
        ) {
          return false;
        }
        if (
          normalized.language &&
          !problem.supportedLanguages.includes(normalized.language)
        ) {
          return false;
        }
        if (normalized.tag && !problem.tags.includes(normalized.tag)) return false;
        return true;
      })
      .sort((left, right) => left.slug.localeCompare(right.slug));
  };

  return {
    getBySlug(slug, { judge = false } = {}) {
      const problem = bySlug.get(String(slug || '').trim().toLowerCase());
      if (!problem) return null;
      return judge ? toJudgeProblem(problem) : toPublicProblem(problem);
    },

    listProblems(query = {}) {
      const normalized = normalizeQuery(query);
      const matches = select(normalized);
      const items = matches
        .slice(normalized.cursor, normalized.cursor + normalized.limit)
        .map(toPublicProblem);
      const nextOffset = normalized.cursor + items.length;
      return {
        items,
        nextCursor: nextOffset < matches.length ? String(nextOffset) : null,
        total: matches.length
      };
    },

    getRandomProblem(filter = {}, random = Math.random) {
      const matches = select({ ...filter, limit: 100, cursor: 0 });
      const pool = matches.length ? matches : select({});
      if (!pool.length) return null;
      const index = Math.min(
        pool.length - 1,
        Math.max(0, Math.floor(random() * pool.length))
      );
      return toPublicProblem(pool[index]);
    },

    get size() {
      return problems.length;
    }
  };
};
