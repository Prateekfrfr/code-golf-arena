import pg from 'pg';
import { DatabaseError } from '../errors/index.js';
import { logger as defaultLogger } from '../observability/logger.js';

/** @typedef {import('./types.js').SqlRow} SqlRow */
/** @typedef {import('./types.js').SqlValue} SqlValue */
/** @typedef {import('./types.js').Queryable} Queryable */
/** @typedef {import('./types.js').Database} Database */

const { Pool } = pg;

/**
 * Creates the only PostgreSQL connection boundary used by repositories.
 * @param {{connectionString: string, max: number, idleTimeoutMs: number, connectionTimeoutMs: number, log?: typeof defaultLogger}} options
 * @returns {Database & { pool: import('pg').Pool, close: () => Promise<void> }}
 */
export const createPostgresDatabase = ({
  connectionString,
  max,
  idleTimeoutMs,
  connectionTimeoutMs,
  log = defaultLogger
}) => {
  if (!connectionString) {
    throw new DatabaseError('DATABASE_URL is required for PostgreSQL persistence.', {
      code: 'DATABASE_CONFIGURATION_INVALID',
      expose: true
    });
  }

  const pool = new Pool({
    connectionString,
    max,
    idleTimeoutMillis: idleTimeoutMs,
    connectionTimeoutMillis: connectionTimeoutMs
  });

  pool.on('error', (error) => {
    log.error('database.pool.error', { error });
  });

  /**
   * @template {SqlRow} T
   * @param {string} text
   * @param {SqlValue[]} [values]
   * @returns {Promise<import('./types.js').QueryResult<T>>}
   */
  const query = async (text, values = []) => {
    try {
      const result = await pool.query(text, values);
      return /** @type {import('./types.js').QueryResult<T>} */ (
        /** @type {unknown} */ (result)
      );
    } catch (error) {
      throw new DatabaseError('PostgreSQL query failed.', {
        cause: error,
        code: 'DATABASE_QUERY_FAILED'
      });
    }
  };

  return {
    pool,
    query,
    /** @template T @param {(transaction: Queryable) => Promise<T>} work */
    async transaction(work) {
      const client = await pool.connect().catch((error) => {
        throw new DatabaseError('PostgreSQL connection failed.', {
          cause: error,
          code: 'DATABASE_CONNECTION_FAILED'
        });
      });
      try {
        await client.query('BEGIN');
        const transaction = /** @type {Queryable} */ (
          /** @type {unknown} */ (client)
        );
        const result = await work(transaction);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK').catch((rollbackError) => {
          log.error('database.transaction.rollback_failed', { error: rollbackError });
        });
        throw error instanceof DatabaseError
          ? error
          : new DatabaseError('PostgreSQL transaction failed.', {
              cause: error,
              code: 'DATABASE_TRANSACTION_FAILED'
            });
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
    }
  };
};
