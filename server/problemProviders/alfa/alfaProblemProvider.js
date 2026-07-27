import { createProblemSync } from '../../problemImport/problemSync.js';
import { toJudgeProblem, toPublicProblem } from '../../problems/problemProjection.js';
import { NotFoundError } from '../../errors/index.js';
import { normalizeAlfaProblem } from './normalizer.js';

/** @typedef {import('./client.js').AlfaListQuery} AlfaListQuery */
/** @typedef {{ slug: string, sourceKey?: string, fetchedAt?: string | null, cacheVersion?: string | null, problem: unknown }} CachedProblem */
/** @typedef {{
 * getBySlug: (slug: string, options?: {includeArchived?: boolean}) => Promise<CachedProblem | null>,
 * listProblems: (query?: Record<string, unknown>) => Promise<{items: CachedProblem[], nextCursor: string | null, total: number}>
 * }} AlfaCacheRepository */
/** @typedef {{ fetchBySlug: (slug: string) => Promise<Record<string, unknown>>, fetchList: (query?: AlfaListQuery) => Promise<{items: Record<string, unknown>[], nextCursor: string | null, total: number | null}> }} AlfaClient */

/** @param {string | null | undefined} value @param {number} ttlDays @param {Date} now */
const isFresh = (value, ttlDays, now) => {
  if (!value) return false;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return false;
  return timestamp + ttlDays * 24 * 60 * 60 * 1000 > now.getTime();
};

/**
 * Alfa is a restricted-provenance adapter over the existing transactional
 * import pipeline. It never produces judgeable problems and uses a cache-only
 * read path when PostgreSQL has a current record.
 *
 * @param {{
 * client: AlfaClient,
 * repository: AlfaCacheRepository,
 * sourceLocator: string,
 * cacheTtlDays: number,
 * cacheVersion: string,
 * storeFullContent: boolean,
 * now?: () => Date,
 * sync?: ReturnType<typeof createProblemSync>
 * }} options
 */
export const createAlfaProblemProvider = ({
  client,
  repository,
  sourceLocator,
  cacheTtlDays,
  cacheVersion,
  storeFullContent,
  now = () => new Date(),
  sync = createProblemSync({ repository })
}) => {
  if (!client?.fetchBySlug || !client?.fetchList) {
    throw new TypeError('Alfa client must implement fetchBySlug and fetchList');
  }
  if (!repository?.getBySlug || !repository?.listProblems) {
    throw new TypeError('Alfa cache repository must implement getBySlug and listProblems');
  }
  if (!sourceLocator || !cacheVersion || !Number.isSafeInteger(cacheTtlDays)) {
    throw new TypeError('Alfa cache configuration is invalid');
  }

  const source = Object.freeze({
    provider: 'alfa',
    locator: sourceLocator,
    ref: cacheVersion,
    provenance: {
      state: 'RESTRICTED_METADATA_ONLY',
      attribution: 'LeetCode'
    }
  });
  const sourceKey = `${source.provider}:${source.locator}`;

  /** @param {Record<string, unknown>} raw */
  const persist = async (raw) => {
    const problem = normalizeAlfaProblem(raw, {
      storeFullContent,
      cacheVersion,
      now
    });
    await sync.sync([problem], {
      source,
      archiveMissing: false
    });
    return problem;
  };

  /** @param {string} slug */
  const getBySlug = async (slug) => {
    const cached = await repository.getBySlug(slug);
    if (cached && cached.sourceKey !== sourceKey) {
      return toPublicProblem(cached.problem);
    }
    if (
      cached?.sourceKey === sourceKey &&
      cached.cacheVersion === cacheVersion &&
      isFresh(cached.fetchedAt, cacheTtlDays, now())
    ) {
      return toPublicProblem(cached.problem);
    }
    const raw = await client.fetchBySlug(slug);
    return toPublicProblem(await persist(raw));
  };

  return Object.freeze({
    getBySlug,
    async getJudgeProblem(slug) {
      const publicProblem = await getBySlug(slug);
      if (!publicProblem) throw new NotFoundError('Alfa problem was not found.');
      return toJudgeProblem(publicProblem);
    },
    async syncSlug(slug) {
      return toPublicProblem(await persist(await client.fetchBySlug(slug)));
    },
    async syncList(query = {}) {
      const response = await client.fetchList(query);
      const items = [];
      for (const raw of response.items) items.push(toPublicProblem(await persist(raw)));
      return { items, nextCursor: response.nextCursor, total: response.total };
    },
    async listCached(query = {}) {
      const result = await repository.listProblems(query);
      return {
        ...result,
        items: result.items
          .filter((record) => record.sourceKey === sourceKey)
          .map((record) => toPublicProblem(record.problem))
      };
    }
  });
};
