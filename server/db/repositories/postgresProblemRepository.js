import crypto from 'node:crypto';
import { DatabaseError, NotFoundError } from '../../errors/index.js';
import { fingerprintProblem } from '../../problemImport/fingerprint.js';
import { normalizeProblem } from '../../problems/problemSchema.js';

/** @typedef {import('../types.js').Database} Database */
/** @typedef {import('../types.js').Queryable} Queryable */
/** @typedef {import('../types.js').SqlValue} SqlValue */
/** @typedef {Record<string, unknown>} JsonObject */
/** @typedef {import('../../problems/problemSchema.js').JsonObject} ProblemJsonObject */
/** @typedef {import('../../problems/problemSchema.js').NormalizedProblem} CanonicalProblem */
/** @typedef {{
 * id: string,
 * slug: string,
 * current_fingerprint: string,
 * current_version: number,
 * source_key: string,
 * provenance_state?: 'LICENSED' | 'RESTRICTED_METADATA_ONLY',
 * canonical_url?: string | null,
 * attribution?: string | null,
 * source_data?: JsonObject,
 * fetched_at?: string | null,
 * cache_version?: string | null,
 * problem: CanonicalProblem
 * }} ProblemRow */
/** @typedef {{
 * id: string,
 * slug: string,
 * fingerprint: string,
 * version: number,
 * sourceKey: string,
 * provenanceState?: 'LICENSED' | 'RESTRICTED_METADATA_ONLY',
 * canonicalUrl?: string | null,
 * attribution?: string | null,
 * sourceData?: JsonObject,
 * fetchedAt?: string | null,
 * cacheVersion?: string | null,
 * problem: CanonicalProblem
 * }} StoredProblem */
/** @typedef {{ search?: string, topic?: string, difficulty?: string, language?: string, tag?: string, solved?: string, userId?: string, status?: string, includeNonPublic?: boolean, includeDeleted?: boolean, limit?: number | string, cursor?: number | string }} ProblemListQuery */
/** @typedef {{
 * slug: string,
 * problem: CanonicalProblem,
 * fingerprint: string,
 * version: number,
 * sourceKey: string,
 * source: JsonObject,
 * sourceData?: JsonObject,
 * importedAt: string | Date
 * }} ProblemVersionWrite */
/** @typedef {{ sourceKey: string, archivedAt: string | Date }} ArchiveOptions */
/** @typedef {{
 * getBySlug: (slug: string, options?: { includeArchived?: boolean }) => Promise<StoredProblem | null>,
 * listProblems: (query?: ProblemListQuery) => Promise<{ items: StoredProblem[], total: number, nextCursor: string | null }>,
 * getRandomProblem: (query?: ProblemListQuery) => Promise<StoredProblem | null>,
 * listSlugsBySource: (sourceKey: string) => Promise<string[]>,
 * saveVersion: (value: ProblemVersionWrite) => Promise<void>,
 * archiveSlugs: (slugs: string[], options: ArchiveOptions) => Promise<void>,
 * requireProblemId: (slug: string) => Promise<string>,
 * transaction: <T>(work: (repository: ProblemRepository) => Promise<T>) => Promise<T>
 * }} ProblemRepository */

/** @param {unknown} value */
const json = (value) => JSON.stringify(value ?? {});
/** @param {unknown} value @returns {string[]} */
const textArray = (value) => Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : [];

/** @param {unknown} value @returns {ProblemJsonObject} */
const objectOrEmpty = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? /** @type {ProblemJsonObject} */ (value)
    : {};

/** @param {unknown} value */
const normalizeOffset = (value) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
};

/** @param {unknown} value */
const normalizeLimit = (value) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? Math.min(100, Math.max(1, parsed)) : 20;
};

/** @param {ProblemRow} row @returns {StoredProblem} */
const asStoredProblem = (row) => ({
  id: row.id,
  slug: row.slug,
  fingerprint: row.current_fingerprint,
  version: row.current_version,
  sourceKey: row.source_key,
  provenanceState: row.provenance_state,
  canonicalUrl: row.canonical_url,
  attribution: row.attribution,
  sourceData: row.source_data,
  fetchedAt: row.fetched_at,
  cacheVersion: row.cache_version,
  problem: row.problem
});

/** @param {ProblemRow[]} rows @returns {StoredProblem[]} */
const mapProblemRows = (rows) => rows.map(asStoredProblem);

/** @param {ProblemListQuery} [query] */
const buildListQuery = (query = {}) => {
  const clauses = [
    query.includeDeleted ? 'TRUE' : 'p.deleted_at IS NULL',
    query.includeNonPublic
      ? 'TRUE'
      : "p.archived_at IS NULL AND p.status = 'published' AND p.visibility = 'public'"
  ];
  /** @type {SqlValue[]} */
  const values = [];
  /** @param {string} sql @param {SqlValue | readonly SqlValue[]} entries */
  const add = (sql, entries) => {
    const parameters = Array.isArray(entries) ? entries : [entries];
    let parameterIndex = 0;
    const statement = sql.replace(/\?/g, () => {
      values.push(parameters[parameterIndex]);
      parameterIndex += 1;
      return `$${values.length}`;
    });
    if (parameterIndex !== parameters.length) {
      throw new DatabaseError('Problem query parameter mismatch.', {
        code: 'DATABASE_QUERY_BUILD_FAILED'
      });
    }
    clauses.push(statement);
  };

  const search = String(query.search || '').trim();
  const topic = String(query.topic || '').trim().toLowerCase();
  const difficulty = String(query.difficulty || '').trim().toLowerCase();
  const language = String(query.language || '').trim().toLowerCase();
  const tag = String(query.tag || '').trim().toLowerCase();
  const solved = String(query.solved || '').trim().toLowerCase();
  const status = String(query.status || '').trim().toLowerCase();
  const userId = String(query.userId || '').trim().toLowerCase();
  if (search) {
    add('(p.title ILIKE ? OR p.statement ILIKE ? OR ? = ANY(p.tags))', [
      `%${search}%`,
      `%${search}%`,
      search.toLowerCase()
    ]);
  }
  if (topic && topic !== 'random') add('p.topic = ?', topic);
  if (difficulty) add('p.difficulty = ?', difficulty);
  if (language) add('? = ANY(p.supported_languages)', language);
  if (tag) add('? = ANY(p.tags)', tag);
  if (status) add('p.status = ?', status);
  if (solved) {
    if ((solved !== 'solved' && solved !== 'unsolved') ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
      throw new DatabaseError('Solved filtering requires a registered user.', {
        code: 'DATABASE_PROBLEM_PROGRESS_FILTER_INVALID',
        expose: true
      });
    }
    const accepted = `EXISTS (
      SELECT 1 FROM submissions progress_submission
      WHERE progress_submission.problem_id = p.id
        AND progress_submission.user_id = ?::UUID
        AND progress_submission.status = 'accepted'
    )`;
    add(solved === 'solved' ? accepted : `NOT ${accepted}`, userId);
  }

  return { where: clauses.join(' AND '), values };
};

/**
 * Provides both the existing problem-provider read contract and the import
 * sync write contract. Values are always query parameters.
 * @param {{database: Database}} options
 * @returns {ProblemRepository}
 */
export const createPostgresProblemRepository = ({ database }) => {
  if (!database?.query || !database?.transaction) {
    throw new DatabaseError('A PostgreSQL database boundary is required.', {
      code: 'DATABASE_REPOSITORY_CONFIGURATION_INVALID',
      expose: true
    });
  }

  /** @param {string} slug @param {{includeArchived?: boolean, includeUnpublished?: boolean}} [options] */
  const getBySlug = async (
    slug,
    { includeArchived = false, includeUnpublished = false } = {}
  ) => {
    /** @type {import('../types.js').QueryResult<ProblemRow>} */
    const result = await database.query(
      `SELECT p.id, p.slug, p.current_fingerprint, p.current_version, p.source_key,
              p.provenance_state, p.canonical_url, p.attribution, p.source_data,
              p.fetched_at, p.cache_version,
              p.current_problem AS problem
       FROM problems p
       WHERE p.slug = $1
         ${includeArchived ? '' : 'AND p.archived_at IS NULL'}
         ${includeUnpublished ? '' : "AND p.status = 'published' AND p.visibility = 'public'"}
         AND p.deleted_at IS NULL`,
      [String(slug || '').trim().toLowerCase()]
    );
    return result.rows[0] ? asStoredProblem(result.rows[0]) : null;
  };

  /** @param {ProblemListQuery} [query] */
  const listProblems = async (query = {}) => {
    const { where, values } = buildListQuery(query);
    const limit = normalizeLimit(query.limit);
    const offset = normalizeOffset(query.cursor);
    /** @type {import('../types.js').QueryResult<{total: number}>} */
    const count = await database.query(
      `SELECT count(*)::INTEGER AS total FROM problems p WHERE ${where}`,
      values
    );
    /** @type {import('../types.js').QueryResult<ProblemRow>} */
    const records = await database.query(
      `SELECT p.id, p.slug, p.current_fingerprint, p.current_version, p.source_key,
              p.provenance_state, p.canonical_url, p.attribution, p.source_data,
              p.fetched_at, p.cache_version,
              p.current_problem AS problem
       FROM problems p
       WHERE ${where}
       ORDER BY p.slug ASC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset]
    );
    const total = count.rows[0]?.total || 0;
    const items = mapProblemRows(records.rows);
    const nextOffset = offset + items.length;
    return { items, total, nextCursor: nextOffset < total ? String(nextOffset) : null };
  };

  /** @param {ProblemListQuery} [query] */
  const getRandomProblem = async (query = {}) => {
    const result = await listProblems({ ...query, limit: 100, cursor: 0 });
    if (result.items.length === 0) return null;
    return result.items[Math.floor(Math.random() * result.items.length)];
  };

  /** @param {unknown} value */
  const requireUuid = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
      throw new DatabaseError('A valid author account is required.', {
        code: 'DATABASE_PROBLEM_AUTHOR_INVALID',
        expose: true
      });
    }
    return normalized;
  };

  /** @param {Queryable} queryable @param {string} problemId @param {string[]} tags */
  const replaceTagsWith = async (queryable, problemId, tags) => {
    await queryable.query('DELETE FROM problem_tags WHERE problem_id = $1', [problemId]);
    for (const tag of tags) {
      const slug = String(tag).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      if (!slug) continue;
      await queryable.query(
        `INSERT INTO tags (id, slug, label)
         VALUES ($1, $2, $3)
         ON CONFLICT (slug) DO UPDATE SET label = EXCLUDED.label`,
        [crypto.randomUUID(), slug, String(tag).trim().slice(0, 80)]
      );
      await queryable.query(
        `INSERT INTO problem_tags (problem_id, tag_id)
         SELECT $1, id FROM tags WHERE slug = $2
         ON CONFLICT DO NOTHING`,
        [problemId, slug]
      );
    }
  };

  /** @param {unknown} input @param {string} authorId */
  const saveAuthoredProblem = async (input, authorId) => {
    const safeAuthorId = requireUuid(authorId);
    const source = {
      provider: 'local',
      locator: 'admin-authoring',
      revision: 'authored',
      license: {
        spdxId: 'CC0-1.0',
        attribution: 'Code Golf Arena original problem'
      }
    };
    return database.transaction(async (transaction) => {
      const draft = normalizeProblem({
        ...(input && typeof input === 'object' ? input : {}),
        authorId: safeAuthorId
      });
      /** @type {import('../types.js').QueryResult<{id: string, current_version: number, current_problem: CanonicalProblem}>} */
      const existing = await transaction.query(
        `SELECT id, current_version, current_problem
         FROM problems WHERE slug = $1 AND deleted_at IS NULL FOR UPDATE`,
        [draft.slug]
      );
      const current = existing.rows[0];
      const now = new Date().toISOString();
      const version = (current?.current_version || 0) + 1;
      const problem = normalizeProblem({
        ...draft,
        version: String(version),
        createdAt: current?.current_problem?.createdAt || draft.createdAt || now,
        updatedAt: now
      });
      const fingerprint = fingerprintProblem(problem);
      await saveVersionWith(transaction, {
        slug: problem.slug,
        problem,
        fingerprint,
        version,
        sourceKey: 'local:admin-authoring',
        source,
        sourceData: {},
        importedAt: now
      });
      const problemId = current?.id || (await transaction.query(
        'SELECT id FROM problems WHERE slug = $1',
        [problem.slug]
      )).rows[0]?.id;
      if (!problemId) {
        throw new DatabaseError('Authored problem could not be reloaded.', {
          code: 'DATABASE_PROBLEM_WRITE_FAILED'
        });
      }
      await replaceTagsWith(transaction, String(problemId), problem.tags);
      await transaction.query(
        'DELETE FROM problem_drafts WHERE author_id = $1 AND slug = $2',
        [safeAuthorId, problem.slug]
      );
      return problem;
    });
  };

  /** @param {string} slug */
  const getVersionHistory = async (slug) => {
    /** @type {import('../types.js').QueryResult<{version: number, fingerprint: string, problem: CanonicalProblem, imported_at: string | Date, source: JsonObject}>} */
    const result = await database.query(
      `SELECT version.version, version.fingerprint, version.problem,
              version.imported_at, version.source
       FROM problem_versions AS version
       JOIN problems AS problem ON problem.id = version.problem_id
       WHERE problem.slug = $1 AND problem.deleted_at IS NULL
       ORDER BY version.version DESC`,
      [String(slug || '').trim().toLowerCase()]
    );
    return result.rows.map((row) => ({
      version: row.version,
      fingerprint: row.fingerprint,
      problem: row.problem,
      importedAt: new Date(row.imported_at).toISOString(),
      source: row.source
    }));
  };

  /** @param {string} slug */
  const softDeleteProblem = async (slug) => {
    const result = await database.query(
      `UPDATE problems
       SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE slug = $1 AND deleted_at IS NULL
       RETURNING id`,
      [String(slug || '').trim().toLowerCase()]
    );
    if (!result.rows[0]) {
      throw new NotFoundError('Problem was not found.', {
        code: 'DATABASE_PROBLEM_NOT_FOUND'
      });
    }
  };

  /** @param {unknown} input @param {string} authorId */
  const saveDraft = async (input, authorId) => {
    const safeAuthorId = requireUuid(authorId);
    const problem = normalizeProblem({
      ...(input && typeof input === 'object' ? input : {}),
      authorId: safeAuthorId,
      status: 'draft'
    });
    await database.query(
      `INSERT INTO problem_drafts (id, problem_id, author_id, slug, draft)
       VALUES (
         $1,
         (SELECT id FROM problems WHERE slug = $2 AND deleted_at IS NULL),
         $3, $2, $4::JSONB
       )
       ON CONFLICT (author_id, slug) DO UPDATE SET
         problem_id = EXCLUDED.problem_id,
         draft = EXCLUDED.draft,
         updated_at = CURRENT_TIMESTAMP`,
      [crypto.randomUUID(), problem.slug, safeAuthorId, json(problem)]
    );
    return problem;
  };

  /** @param {string} slug @param {string} authorId */
  const getDraft = async (slug, authorId) => {
    const result = await database.query(
      `SELECT draft, updated_at FROM problem_drafts
       WHERE author_id = $1 AND slug = $2`,
      [requireUuid(authorId), String(slug || '').trim().toLowerCase()]
    );
    return result.rows[0]
      ? {
          problem: result.rows[0].draft,
          updatedAt: new Date(/** @type {string | Date} */ (result.rows[0].updated_at)).toISOString()
        }
      : null;
  };

  const listTags = async () => {
    const result = await database.query(
      `SELECT tag.slug, tag.label, count(problem_tag.problem_id)::INTEGER AS problem_count
       FROM tags AS tag
       LEFT JOIN problem_tags AS problem_tag ON problem_tag.tag_id = tag.id
       GROUP BY tag.id, tag.slug, tag.label
       ORDER BY tag.label ASC`
    );
    return result.rows.map((row) => ({
      slug: String(row.slug),
      label: String(row.label),
      problemCount: Number(row.problem_count)
    }));
  };

  /** @param {string} sourceKey */
  const listSlugsBySource = async (sourceKey) => {
    /** @type {import('../types.js').QueryResult<{slug: string}>} */
    const result = await database.query(
      'SELECT slug FROM problems WHERE source_key = $1 AND archived_at IS NULL ORDER BY slug ASC',
      [sourceKey]
    );
    return result.rows.map((row) => row.slug);
  };

  /** @param {Queryable} queryable @param {ProblemVersionWrite} value */
  const saveVersionWith = async (queryable, value) => {
    const problem = value.problem;
    if (!problem?.slug || !value.fingerprint || !value.sourceKey || !value.source) {
      throw new DatabaseError('Problem version write is incomplete.', {
        code: 'DATABASE_PROBLEM_VERSION_INVALID',
        expose: true
      });
    }
    /** @type {import('../types.js').QueryResult<{id: string}>} */
    const existing = await queryable.query('SELECT id FROM problems WHERE slug = $1 FOR UPDATE', [
      value.slug
    ]);
    const id = existing.rows[0]?.id || crypto.randomUUID();
    const provenance = problem.provenance;
    const sourceData = objectOrEmpty(problem.metadata.sourceData);
    const provenanceState = provenance.state === 'RESTRICTED_METADATA_ONLY'
      ? 'RESTRICTED_METADATA_ONLY'
      : 'LICENSED';
    const canonicalUrl = typeof provenance.canonicalUrl === 'string'
      ? provenance.canonicalUrl
      : null;
    const attribution = typeof provenance.attribution === 'string'
      ? provenance.attribution
      : null;
    const fetchedAt = typeof sourceData.fetchedAt === 'string' ? sourceData.fetchedAt : null;
    const cacheVersion = typeof sourceData.cacheVersion === 'string'
      ? sourceData.cacheVersion
      : null;
    await queryable.query(
      `INSERT INTO problems (
          id, slug, title, statement, difficulty, topic, tags, supported_languages,
          current_version, current_fingerprint, current_problem, source_key,
          provenance_state, canonical_url, attribution, source_data, fetched_at,
          cache_version, author_id, status, visibility, archived_at, deleted_at,
          updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7::TEXT[], $8::TEXT[], $9, $10, $11::JSONB, $12,
          $13, $14, $15, $16::JSONB, $17::TIMESTAMPTZ, $18, $19::UUID, $20, $21,
          CASE WHEN $20 = 'archived' THEN CURRENT_TIMESTAMP ELSE NULL END,
          NULL, CURRENT_TIMESTAMP
        )
        ON CONFLICT (slug) DO UPDATE SET
          title = EXCLUDED.title,
          statement = EXCLUDED.statement,
          difficulty = EXCLUDED.difficulty,
          topic = EXCLUDED.topic,
          tags = EXCLUDED.tags,
          supported_languages = EXCLUDED.supported_languages,
          current_version = EXCLUDED.current_version,
          current_fingerprint = EXCLUDED.current_fingerprint,
          current_problem = EXCLUDED.current_problem,
          source_key = EXCLUDED.source_key,
          provenance_state = EXCLUDED.provenance_state,
          canonical_url = EXCLUDED.canonical_url,
          attribution = EXCLUDED.attribution,
          source_data = EXCLUDED.source_data,
          fetched_at = EXCLUDED.fetched_at,
          cache_version = EXCLUDED.cache_version,
          author_id = COALESCE(EXCLUDED.author_id, problems.author_id),
          status = EXCLUDED.status,
          visibility = EXCLUDED.visibility,
          archived_at = EXCLUDED.archived_at,
          deleted_at = NULL,
          updated_at = CURRENT_TIMESTAMP`,
      [
        id,
        value.slug,
        problem.title,
        problem.statement,
        problem.difficulty,
        problem.topic,
        textArray(problem.tags),
        textArray(problem.supportedLanguages),
        value.version,
        value.fingerprint,
        json(problem),
        value.sourceKey,
        provenanceState,
        canonicalUrl,
        attribution,
        json(sourceData),
        fetchedAt,
        cacheVersion,
        problem.authorId,
        problem.status,
        problem.visibility
      ]
    );
    await queryable.query(
      `INSERT INTO problem_versions (
        id, problem_id, version, fingerprint, source_key, source, problem, source_data, imported_at
      ) VALUES ($1, $2, $3, $4, $5, $6::JSONB, $7::JSONB, $8::JSONB, $9::TIMESTAMPTZ)`,
      [
        crypto.randomUUID(),
        id,
        value.version,
        value.fingerprint,
        value.sourceKey,
        json(value.source),
        json(problem),
        json(value.sourceData),
        value.importedAt
      ]
    );
  };

  /** @param {Queryable} queryable @param {string[]} slugs @param {ArchiveOptions} options */
  const archiveSlugsWith = async (queryable, slugs, { sourceKey, archivedAt }) => {
    if (!slugs.length) return;
    await queryable.query(
      `UPDATE problems
       SET archived_at = $1::TIMESTAMPTZ, updated_at = CURRENT_TIMESTAMP
       WHERE source_key = $2 AND slug = ANY($3::TEXT[])`,
      [archivedAt, sourceKey, slugs]
    );
  };

  const repository = {
    getBySlug,
    listProblems,
    getRandomProblem,
    saveAuthoredProblem,
    getVersionHistory,
    softDeleteProblem,
    saveDraft,
    getDraft,
    listTags,
    listSlugsBySource,
    /** @param {ProblemVersionWrite} value */
    saveVersion(value) {
      return saveVersionWith(database, value);
    },
    /** @param {string[]} slugs @param {ArchiveOptions} options */
    archiveSlugs(slugs, options) {
      return archiveSlugsWith(database, slugs, options);
    },
    /** @param {string} slug */
    async requireProblemId(slug) {
      const problem = await getBySlug(slug);
      if (!problem) {
        throw new NotFoundError('Problem was not found in PostgreSQL.', {
          code: 'DATABASE_PROBLEM_NOT_FOUND'
        });
      }
      return problem.id;
    },
    /**
     * @template T
     * @param {(repository: ProblemRepository) => Promise<T>} work
     * @returns {Promise<T>}
     */
    async transaction(work) {
      return database.transaction(async (transaction) => {
        /** @type {ProblemRepository} */
        const scopedRepository = {
          ...repository,
          /** @param {string} slug */
          getBySlug: async (slug) => {
            /** @type {import('../types.js').QueryResult<ProblemRow>} */
            const result = await transaction.query(
              `SELECT p.id, p.slug, p.current_fingerprint, p.current_version, p.source_key,
                      p.provenance_state, p.canonical_url, p.attribution, p.source_data,
                      p.fetched_at, p.cache_version,
                      p.current_problem AS problem
               FROM problems p WHERE p.slug = $1 AND p.archived_at IS NULL`,
              [String(slug || '').trim().toLowerCase()]
            );
            return result.rows[0] ? asStoredProblem(result.rows[0]) : null;
          },
          /** @param {string} sourceKey */
          listSlugsBySource: async (sourceKey) => {
            /** @type {import('../types.js').QueryResult<{slug: string}>} */
            const result = await transaction.query(
              'SELECT slug FROM problems WHERE source_key = $1 AND archived_at IS NULL ORDER BY slug ASC',
              [sourceKey]
            );
            return result.rows.map((row) => row.slug);
          },
          /** @param {ProblemVersionWrite} value */
          saveVersion: (value) => saveVersionWith(transaction, value),
          /** @param {string[]} slugs @param {ArchiveOptions} options */
          archiveSlugs: (slugs, options) => archiveSlugsWith(transaction, slugs, options)
        };
        return work(scopedRepository);
      });
    }
  };

  return repository;
};
