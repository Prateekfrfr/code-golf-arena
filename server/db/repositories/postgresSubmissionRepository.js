import crypto from 'node:crypto';
import { DatabaseError } from '../../errors/index.js';

/** @typedef {import('../types.js').Database} Database */
/** @typedef {Record<string, unknown>} JsonObject */
/** @typedef {{
 * id: string,
 * user_id: string,
 * guest_id: string | null,
 * display_name: string | null,
 * email: string | null,
 * problem_slug: string,
 * language: string,
 * status: string,
 * character_count: number,
 * character_bytes: number,
 * code_point_count: number,
 * runtime_ms: number | string,
 * memory_bytes: number | string | null,
 * compression: JsonObject | null,
 * compression_score: number | null,
 * submitted_at: string | Date,
 * score: number | string | null,
 * breakdown: JsonObject | null
 * }} SubmissionRow */
/** @typedef {{
 * id: string,
 * playerId: string,
 * userId: string,
 * problemId: string,
 * problemVersion?: number,
 * language: string,
 * success: boolean,
 * status: string,
 * characterCount: number,
 * characterBytes: number,
 * codePointCount: number,
 * runtimeMs: number,
 * memoryBytes: number | null,
 * score: number | null,
 * scoreBreakdown: JsonObject | null,
 * compression: JsonObject | null,
 * compressionScore: number | null,
 * submittedAt: number
 * }} StoredSubmission */
/** @typedef {{
 * id?: string,
 * playerId: string,
 * userId?: string,
 * accountId?: string,
 * problemId: string,
 * problemVersion?: number,
 * language: string,
 * status: string,
 * sourceCode: string,
 * characterCount: number,
 * characterBytes: number,
 * codePointCount: number,
 * runtimeMs: number,
 * memoryBytes: number | null,
 * compression?: JsonObject | null,
 * compressionScore?: number | null,
 * score: number,
 * maxScore: number,
 * scoreBreakdown: JsonObject & { configVersion: string },
 * analytics: JsonObject,
 * submittedAt?: number
 * }} SubmissionWrite */
/** @typedef {{
 * add: (roomCode: string, record: SubmissionWrite) => Promise<SubmissionWrite & { id: string, submittedAt: number }>,
 * list: (roomCode: string) => Promise<StoredSubmission[]>,
 * getLeaderboard: (roomCode: string, options?: { language?: string }) => Promise<StoredSubmission[]>,
 * deleteRoom: (roomCode: string) => Promise<void>
 * }} SubmissionRepository */

/** @param {unknown} value */
const json = (value) => JSON.stringify(value ?? {});

/** @param {SubmissionRow} row @returns {StoredSubmission} */
const toStoredSubmission = (row) =>
  Object.freeze({
    id: row.id,
    playerId: row.display_name || row.guest_id || row.email || row.user_id,
    userId: row.user_id,
    problemId: row.problem_slug,
    language: row.language,
    success: row.status === 'accepted',
    status: row.status,
    characterCount: row.character_count,
    characterBytes: row.character_bytes,
    codePointCount: row.code_point_count,
    runtimeMs: Number(row.runtime_ms),
    memoryBytes: row.memory_bytes === null ? null : Number(row.memory_bytes),
    score: row.score === null ? null : Number(row.score),
    scoreBreakdown: row.breakdown || null,
    compression: row.compression || null,
    compressionScore: row.compression_score === null ? null : Number(row.compression_score),
    submittedAt: new Date(row.submitted_at).getTime()
  });

/**
 * Durable submission persistence. A submission, score, and analytics payload
 * are inserted in one transaction, while room-local score broadcasting remains
 * in the existing in-memory score repository until the Redis phase.
 * @param {{database: Database}} options
 * @returns {SubmissionRepository}
 */
export const createPostgresSubmissionRepository = ({ database }) => {
  if (!database?.transaction || !database?.query) {
    throw new DatabaseError('A PostgreSQL transaction boundary is required.', {
      code: 'DATABASE_REPOSITORY_CONFIGURATION_INVALID',
      expose: true
    });
  }

  /** @param {string} roomCode @param {SubmissionWrite} record */
  const add = async (roomCode, record) => {
      if (!record?.playerId || !record?.problemId || !record?.sourceCode) {
        throw new DatabaseError('Durable submission data is incomplete.', {
          code: 'DATABASE_SUBMISSION_INVALID',
          expose: true
        });
      }
      if (!record.analytics || !record.scoreBreakdown) {
        throw new DatabaseError('Submission analytics and score breakdown are required.', {
          code: 'DATABASE_SUBMISSION_DERIVATIVES_MISSING',
          expose: true
        });
      }

      const id = record.id || crypto.randomUUID();
      const submittedAt = record.submittedAt || Date.now();
      return database.transaction(async (transaction) => {
        /** @type {import('../types.js').QueryResult<{id: string}>} */
        const userResult = record.accountId
          ? await transaction.query('SELECT id FROM users WHERE id = $1', [record.accountId])
          : await transaction.query(
              `INSERT INTO users (id, guest_id, updated_at)
               VALUES ($1, $2, CURRENT_TIMESTAMP)
               ON CONFLICT (guest_id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
               RETURNING id`,
              [crypto.randomUUID(), record.playerId]
            );
        if (!userResult.rows[0]) {
          throw new DatabaseError('Submission references an unknown user.', {
            code: 'DATABASE_SUBMISSION_USER_NOT_FOUND',
            expose: true
          });
        }
        /** @type {import('../types.js').QueryResult<{id: string, slug: string, current_version: number}>} */
        const problemResult = await transaction.query(
          'SELECT id, slug, current_version FROM problems WHERE slug = $1 AND archived_at IS NULL',
          [record.problemId]
        );
        if (!problemResult.rows[0]) {
          throw new DatabaseError('Submission references an unknown problem.', {
            code: 'DATABASE_SUBMISSION_PROBLEM_NOT_FOUND',
            expose: true
          });
        }
        const user = userResult.rows[0];
        const problem = problemResult.rows[0];
        await transaction.query(
          `INSERT INTO submissions (
            id, room_code, user_id, problem_id, problem_version, language, status, source_code,
            character_count, character_bytes, code_point_count, runtime_ms,
            memory_bytes, compression, compression_score, submitted_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::JSONB, $15, $16::TIMESTAMPTZ
          )`,
          [
            id,
            roomCode,
            user.id,
            problem.id,
            Number(record.problemVersion || problem.current_version),
            record.language,
            record.status,
            record.sourceCode,
            record.characterCount,
            record.characterBytes,
            record.codePointCount,
            record.runtimeMs,
            record.memoryBytes,
            record.compression ? json(record.compression) : null,
            record.compressionScore ?? null,
            new Date(submittedAt).toISOString()
          ]
        );
        await transaction.query(
          `INSERT INTO submission_scores (
            submission_id, score, max_score, config_version, breakdown
          ) VALUES ($1, $2, $3, $4, $5::JSONB)`,
          [
            id,
            record.score,
            record.maxScore,
            record.scoreBreakdown.configVersion,
            json(record.scoreBreakdown)
          ]
        );
        await transaction.query(
          'INSERT INTO submission_analytics (submission_id, data) VALUES ($1, $2::JSONB)',
          [id, json(record.analytics)]
        );
        return Object.freeze({ ...record, id, submittedAt });
      });
    };

  /** @param {string} roomCode @returns {Promise<StoredSubmission[]>} */
  const list = async (roomCode) => {
      /** @type {import('../types.js').QueryResult<SubmissionRow>} */
      const result = await database.query(
        `SELECT s.id, s.user_id, u.guest_id, u.display_name, u.email,
                p.slug AS problem_slug, s.language, s.status,
                s.character_count, s.character_bytes, s.code_point_count,
                s.runtime_ms, s.memory_bytes, s.compression, s.compression_score,
                s.submitted_at, score.score, score.breakdown
         FROM submissions s
         JOIN users u ON u.id = s.user_id
         JOIN problems p ON p.id = s.problem_id
         LEFT JOIN submission_scores score ON score.submission_id = s.id
         WHERE s.room_code = $1
         ORDER BY s.submitted_at ASC, s.id ASC`,
        [roomCode]
      );
    return result.rows.map(toStoredSubmission);
  };

  /** @param {string} roomCode @param {{language?: string}} [options] */
  const getLeaderboard = async (roomCode, { language } = {}) => {
      const entries = await list(roomCode);
      const bestByPlayer = new Map();
      for (const entry of entries) {
        if (
          !entry.success ||
          entry.score === null ||
          (language && entry.language !== language)
        ) continue;
        const current = bestByPlayer.get(entry.playerId);
        if (
          !current ||
          entry.score > current.score ||
          (entry.score === current.score && entry.characterCount < current.characterCount) ||
          (entry.score === current.score &&
            entry.characterCount === current.characterCount &&
            entry.runtimeMs < current.runtimeMs)
        ) {
          bestByPlayer.set(entry.playerId, entry);
        }
      }
    return [...bestByPlayer.values()].sort((left, right) => {
        if (left.score !== right.score) return right.score - left.score;
        if (left.characterCount !== right.characterCount) {
          return left.characterCount - right.characterCount;
        }
        return left.runtimeMs - right.runtimeMs;
    });
  };

  const deleteRoom = async () => {
      // Durable records intentionally survive room cleanup.
  };

  return { add, list, getLeaderboard, deleteRoom };
};
