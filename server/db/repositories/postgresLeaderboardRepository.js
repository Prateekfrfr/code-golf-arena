import { DatabaseError, ValidationError } from '../../errors/index.js';

/** @typedef {import('../types.js').Database} Database */
/** @typedef {import('../types.js').SqlValue} SqlValue */

/** @typedef {{ limit?: number | string, cursor?: number | string, language?: string }} LeaderboardOptions */
/** @typedef {{ limit?: number | string, cursor?: number | string, language?: string, status?: 'all' | 'solved' | 'unsolved' }} ProgressOptions */
/** @typedef {{
 * user_id: string,
 * display_name: string,
 * total_score: number | string,
 * solved_count: number | string,
 * total_character_count: number | string,
 * total_runtime_ms: number | string,
 * last_submitted_at: string | Date,
 * rank: number | string
 * }} AggregateLeaderboardRow */
/** @typedef {{
 * problem_slug: string,
 * problem_title: string,
 * language: string,
 * score: number | string,
 * character_count: number,
 * runtime_ms: number | string,
 * submitted_at: string | Date,
 * rank: number | string
 * }} PersonalLeaderboardRow */
/** @typedef {{
 * problem_slug: string,
 * problem_title: string,
 * difficulty: string,
 * topic: string,
 * submission_id: string | null,
 * language: string | null,
 * score: number | string | null,
 * character_count: number | null,
 * runtime_ms: number | string | null,
 * submitted_at: string | Date | null
 * }} ProgressRow */
/** @typedef {{
 * userId: string,
 * displayName: string | null,
 * totalScore: number,
 * solvedCount: number,
 * totalCharacterCount: number,
 * totalRuntimeMs: number,
 * lastSubmittedAt: number,
 * rank: number
 * }} LeaderboardEntry */
/** @typedef {{
 * problemSlug: string,
 * problemTitle: string,
 * language: string,
 * score: number,
 * characterCount: number,
 * runtimeMs: number,
 * submittedAt: number,
 * rank: number
 * }} PersonalLeaderboardEntry */
/** @typedef {{
 * problemSlug: string,
 * problemTitle: string,
 * difficulty: string,
 * topic: string,
 * status: 'solved' | 'unsolved',
 * bestSubmission: null | { id: string, language: string, score: number, characterCount: number, runtimeMs: number, submittedAt: number }
 * }} ProblemProgress */

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const MAX_SLUG_LENGTH = 160;
const MAX_LANGUAGE_LENGTH = 32;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** @param {unknown} value @param {string} field @param {number} maximum */
const requiredIdentifier = (value, field, maximum) => {
  if (typeof value !== 'string') {
    throw new ValidationError(`${field} must be a string.`, { code: 'LEADERBOARD_QUERY_INVALID' });
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum || /[\u0000-\u001F\u007F]/.test(normalized)) {
    throw new ValidationError(`${field} is invalid.`, { code: 'LEADERBOARD_QUERY_INVALID' });
  }
  return normalized;
};

/** @param {unknown} value @param {string} field @param {number} fallback @param {number} maximum */
const boundedInteger = (value, field, fallback, maximum) => {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(normalized) || normalized < 0 || normalized > maximum) {
    throw new ValidationError(`${field} must be an integer between 0 and ${maximum}.`, {
      code: 'LEADERBOARD_QUERY_INVALID'
    });
  }
  return normalized;
};

/** @param {unknown} value */
const optionalLanguage = (value) => {
  if (value === undefined || value === null || value === '') return null;
  return requiredIdentifier(value, 'language', MAX_LANGUAGE_LENGTH).toLowerCase();
};

/** @param {unknown} value */
const requiredUserId = (value) => {
  const normalized = requiredIdentifier(value, 'userId', 36).toLowerCase();
  if (!UUID_PATTERN.test(normalized)) {
    throw new ValidationError('userId must be a UUID.', { code: 'LEADERBOARD_QUERY_INVALID' });
  }
  return normalized;
};

/** @param {LeaderboardOptions} options */
const pageOptions = (options = {}) => {
  const limit = boundedInteger(options.limit, 'limit', DEFAULT_LIMIT, MAX_LIMIT);
  if (limit < 1) {
    throw new ValidationError(`limit must be an integer between 1 and ${MAX_LIMIT}.`, {
      code: 'LEADERBOARD_QUERY_INVALID'
    });
  }
  return {
    limit,
    cursor: boundedInteger(options.cursor, 'cursor', 0, Number.MAX_SAFE_INTEGER),
    language: optionalLanguage(options.language)
  };
};

/** @param {number | string} value @param {string} field */
const numberValue = (value, field) => {
  const normalized = Number(value);
  if (!Number.isSafeInteger(normalized) || normalized < 0) {
    throw new DatabaseError(`PostgreSQL returned an invalid ${field}.`, {
      code: 'DATABASE_LEADERBOARD_RESULT_INVALID'
    });
  }
  return normalized;
};

/** @param {string | Date} value @param {string} field */
const timestampValue = (value, field) => {
  const normalized = new Date(value).getTime();
  if (!Number.isFinite(normalized)) {
    throw new DatabaseError(`PostgreSQL returned an invalid ${field}.`, {
      code: 'DATABASE_LEADERBOARD_RESULT_INVALID'
    });
  }
  return normalized;
};

/** @param {AggregateLeaderboardRow} row @returns {LeaderboardEntry} */
const toLeaderboardEntry = (row) => Object.freeze({
  userId: row.user_id,
  displayName: row.display_name,
  totalScore: numberValue(row.total_score, 'total_score'),
  solvedCount: numberValue(row.solved_count, 'solved_count'),
  totalCharacterCount: numberValue(row.total_character_count, 'total_character_count'),
  totalRuntimeMs: numberValue(row.total_runtime_ms, 'total_runtime_ms'),
  lastSubmittedAt: timestampValue(row.last_submitted_at, 'last_submitted_at'),
  rank: numberValue(row.rank, 'rank')
});

/** @param {PersonalLeaderboardRow} row @returns {PersonalLeaderboardEntry} */
const toPersonalLeaderboardEntry = (row) => Object.freeze({
  problemSlug: row.problem_slug,
  problemTitle: row.problem_title,
  language: row.language,
  score: numberValue(row.score, 'score'),
  characterCount: numberValue(row.character_count, 'character_count'),
  runtimeMs: numberValue(row.runtime_ms, 'runtime_ms'),
  submittedAt: timestampValue(row.submitted_at, 'submitted_at'),
  rank: numberValue(row.rank, 'rank')
});

/** @param {ProgressRow} row @returns {ProblemProgress} */
const toProblemProgress = (row) => {
  const submissionId = row.submission_id;
  const solved = submissionId !== null;
  return Object.freeze({
    problemSlug: row.problem_slug,
    problemTitle: row.problem_title,
    difficulty: row.difficulty,
    topic: row.topic,
    status: solved ? 'solved' : 'unsolved',
    bestSubmission: solved
      ? Object.freeze({
          id: submissionId,
          language: /** @type {string} */ (row.language),
          score: numberValue(/** @type {number | string} */ (row.score), 'score'),
          characterCount: numberValue(/** @type {number} */ (row.character_count), 'character_count'),
          runtimeMs: numberValue(/** @type {number | string} */ (row.runtime_ms), 'runtime_ms'),
          submittedAt: timestampValue(/** @type {string | Date} */ (row.submitted_at), 'submitted_at')
        })
      : null
  });
};

const aggregateFrom = `
  WITH ranked_submissions AS (
    SELECT s.user_id, s.problem_id, s.language, s.character_count, s.runtime_ms,
           s.submitted_at, score.score,
           ROW_NUMBER() OVER (
             PARTITION BY s.user_id, s.problem_id
             ORDER BY score.score DESC, s.character_count ASC, s.runtime_ms ASC,
                      s.submitted_at ASC, s.id ASC
           ) AS problem_rank
    FROM submissions s
    JOIN submission_scores score ON score.submission_id = s.id
    JOIN problems p ON p.id = s.problem_id
    JOIN users u ON u.id = s.user_id
    WHERE s.status = 'accepted'
      AND p.archived_at IS NULL
      AND ($1::TEXT IS NULL OR p.slug = $1)
      AND ($2::TEXT IS NULL OR s.language = $2)
      AND ($3::UUID IS NULL OR u.id = $3)
  ), best_per_problem AS (
    SELECT * FROM ranked_submissions WHERE problem_rank = 1
  ), aggregates AS (
    SELECT u.id AS user_id,
           COALESCE(NULLIF(btrim(u.display_name), ''), NULLIF(u.guest_id, ''), u.email) AS display_name,
           SUM(best.score)::BIGINT AS total_score,
           COUNT(*)::INTEGER AS solved_count,
           SUM(best.character_count)::BIGINT AS total_character_count,
           SUM(best.runtime_ms)::BIGINT AS total_runtime_ms,
           MAX(best.submitted_at) AS last_submitted_at
    FROM best_per_problem best
    JOIN users u ON u.id = best.user_id
    GROUP BY u.id, u.display_name, u.guest_id, u.email
  )`;

const aggregateRowsQuery = `${aggregateFrom}
  SELECT user_id, display_name, total_score, solved_count, total_character_count,
         total_runtime_ms, last_submitted_at,
         RANK() OVER (
           ORDER BY total_score DESC, solved_count DESC, total_character_count ASC,
                    total_runtime_ms ASC, user_id ASC
         )::INTEGER AS rank
  FROM aggregates
  ORDER BY total_score DESC, solved_count DESC, total_character_count ASC,
           total_runtime_ms ASC, user_id ASC
  LIMIT $4 OFFSET $5`;

const aggregateCountQuery = `${aggregateFrom}
  SELECT COUNT(*)::INTEGER AS total FROM aggregates`;

const personalFrom = `
  WITH ranked_submissions AS (
    SELECT p.slug AS problem_slug, p.title AS problem_title, s.language,
           score.score, s.character_count, s.runtime_ms, s.submitted_at,
           ROW_NUMBER() OVER (
             PARTITION BY s.problem_id
             ORDER BY score.score DESC, s.character_count ASC, s.runtime_ms ASC,
                      s.submitted_at ASC, s.id ASC
           ) AS problem_rank
    FROM submissions s
    JOIN submission_scores score ON score.submission_id = s.id
    JOIN problems p ON p.id = s.problem_id
    JOIN users u ON u.id = s.user_id
    WHERE s.status = 'accepted'
      AND p.archived_at IS NULL
      AND u.id = $1::UUID
      AND ($2::TEXT IS NULL OR s.language = $2)
  ), personal_entries AS (
    SELECT * FROM ranked_submissions WHERE problem_rank = 1
  )`;

const personalRowsQuery = `${personalFrom}
  SELECT problem_slug, problem_title, language, score, character_count, runtime_ms,
         submitted_at,
         RANK() OVER (
           ORDER BY score DESC, character_count ASC, runtime_ms ASC,
                    submitted_at ASC, problem_slug ASC
         )::INTEGER AS rank
  FROM personal_entries
  ORDER BY score DESC, character_count ASC, runtime_ms ASC, submitted_at ASC, problem_slug ASC
  LIMIT $3 OFFSET $4`;

const personalCountQuery = `${personalFrom}
  SELECT COUNT(*)::INTEGER AS total FROM personal_entries`;

const progressFrom = `
  WITH current_user AS (
    SELECT id FROM users WHERE id = $1::UUID
  ), ranked_submissions AS (
    SELECT s.id AS submission_id, s.problem_id, s.language, score.score,
           s.character_count, s.runtime_ms, s.submitted_at,
           ROW_NUMBER() OVER (
             PARTITION BY s.problem_id
             ORDER BY score.score DESC, s.character_count ASC, s.runtime_ms ASC,
                      s.submitted_at ASC, s.id ASC
           ) AS problem_rank
    FROM submissions s
    JOIN submission_scores score ON score.submission_id = s.id
    JOIN current_user u ON u.id = s.user_id
    WHERE s.status = 'accepted'
      AND ($2::TEXT IS NULL OR s.language = $2)
  ), best_submissions AS (
    SELECT * FROM ranked_submissions WHERE problem_rank = 1
  ), progress AS (
    SELECT p.slug AS problem_slug, p.title AS problem_title, p.difficulty, p.topic,
           best.submission_id, best.language, best.score, best.character_count,
           best.runtime_ms, best.submitted_at
    FROM problems p
    LEFT JOIN best_submissions best ON best.problem_id = p.id
    WHERE p.archived_at IS NULL
      AND ($3::TEXT = 'all'
           OR ($3::TEXT = 'solved' AND best.submission_id IS NOT NULL)
           OR ($3::TEXT = 'unsolved' AND best.submission_id IS NULL))
  )`;

const progressRowsQuery = `${progressFrom}
  SELECT problem_slug, problem_title, difficulty, topic, submission_id, language,
         score, character_count, runtime_ms, submitted_at
  FROM progress
  ORDER BY problem_slug ASC
  LIMIT $4 OFFSET $5`;

const progressCountQuery = `${progressFrom}
  SELECT COUNT(*)::INTEGER AS total FROM progress`;

/**
 * Reads durable leaderboard and progress views from PostgreSQL. Every
 * identifier and pagination value is validated before it is supplied as a
 * PostgreSQL parameter; SQL text itself never incorporates caller input.
 * @param {{database: Database}} options
 */
export const createPostgresLeaderboardRepository = ({ database }) => {
  if (!database?.query) {
    throw new DatabaseError('A PostgreSQL database boundary is required.', {
      code: 'DATABASE_REPOSITORY_CONFIGURATION_INVALID',
      expose: true
    });
  }

  /** @param {SqlValue[]} values @param {string} rowsQuery @param {string} countQuery @param {(row: unknown) => unknown} map */
  const paged = async (values, rowsQuery, countQuery, map) => {
    const [rowsResult, countResult] = await Promise.all([
      database.query(rowsQuery, values),
      database.query(countQuery, values.slice(0, -2))
    ]);
    const countRow = /** @type {{total?: number | string} | undefined} */ (
      /** @type {unknown} */ (countResult.rows[0])
    );
    const total = numberValue(countRow?.total ?? 0, 'total');
    const items = rowsResult.rows.map(map);
    const cursorValue = values.at(-1);
    const cursor = typeof cursorValue === 'number' ? cursorValue : 0;
    return Object.freeze({
      items: Object.freeze(items),
      total,
      nextCursor: cursor + items.length < total ? String(cursor + items.length) : null
    });
  };

  /** @param {string | null} problemSlug @param {string | null} language @param {string | null} userId @param {LeaderboardOptions} [options] */
  const aggregateLeaderboard = async (problemSlug, language, userId, options = {}) => {
    const page = pageOptions(options);
    const selectedLanguage = language ?? page.language;
    return paged(
      [problemSlug, selectedLanguage, userId, page.limit, page.cursor],
      aggregateRowsQuery,
      aggregateCountQuery,
      (row) => toLeaderboardEntry(/** @type {AggregateLeaderboardRow} */ (row))
    );
  };

  return Object.freeze({
    /** @param {LeaderboardOptions} [options] */
    getGlobalLeaderboard(options = {}) {
      return aggregateLeaderboard(null, optionalLanguage(options.language), null, options);
    },
    /** @param {string} problemSlug @param {LeaderboardOptions} [options] */
    getProblemLeaderboard(problemSlug, options = {}) {
      return aggregateLeaderboard(requiredIdentifier(problemSlug, 'problemSlug', MAX_SLUG_LENGTH).toLowerCase(), null, null, options);
    },
    /** @param {string} language @param {Omit<LeaderboardOptions, 'language'>} [options] */
    getLanguageLeaderboard(language, options = {}) {
      return aggregateLeaderboard(null, optionalLanguage(language), null, options);
    },
    /** @param {string} userId @param {LeaderboardOptions} [options] */
    async getPersonalLeaderboard(userId, options = {}) {
      const normalizedUserId = requiredUserId(userId);
      const page = pageOptions(options);
      return paged(
        [normalizedUserId, page.language, page.limit, page.cursor],
        personalRowsQuery,
        personalCountQuery,
        (row) => toPersonalLeaderboardEntry(/** @type {PersonalLeaderboardRow} */ (row))
      );
    },
    /** @param {string} userId @param {ProgressOptions} [options] */
    async getProgress(userId, options = {}) {
      const normalizedUserId = requiredUserId(userId);
      const page = pageOptions(options);
      const status = options.status ?? 'all';
      if (status !== 'all' && status !== 'solved' && status !== 'unsolved') {
        throw new ValidationError('status must be all, solved, or unsolved.', {
          code: 'LEADERBOARD_QUERY_INVALID'
        });
      }
      return paged(
        [normalizedUserId, page.language, status, page.limit, page.cursor],
        progressRowsQuery,
        progressCountQuery,
        (row) => toProblemProgress(/** @type {ProgressRow} */ (row))
      );
    }
  });
};
