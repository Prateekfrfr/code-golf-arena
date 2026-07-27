import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseError } from '../errors/index.js';

/** @typedef {import('./types.js').Database} Database */
/** @typedef {import('./types.js').Queryable} Queryable */
/** @typedef {{ name: string, up: string, down: string }} Migration */
/** @typedef {{ name: string }} MigrationRow */

const migrationDirectory = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'migrations'
);
const UP_PATTERN = /^(\d+_[a-z0-9_-]+)\.up\.sql$/i;

/** @returns {Promise<Migration[]>} */
const readMigrations = async () => {
  const entries = await fs.readdir(migrationDirectory, { withFileTypes: true });
  /** @type {Migration[]} */
  const migrations = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const match = entry.name.match(UP_PATTERN);
    if (!match) continue;
    const name = match[1];
    const upPath = path.join(migrationDirectory, entry.name);
    const downPath = path.join(migrationDirectory, `${name}.down.sql`);
    const [up, down] = await Promise.all([
      fs.readFile(upPath, 'utf8'),
      fs.readFile(downPath, 'utf8')
    ]);
    migrations.push({ name, up, down });
  }
  return migrations.sort((left, right) => left.name.localeCompare(right.name));
};

/** @param {Queryable} queryable */
const ensureMigrationTable = (queryable) =>
  queryable.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  );

/** @param {Database} database */
export const migrateUp = async (database) => {
  const migrations = await readMigrations();
  await database.query('SELECT pg_advisory_lock($1)', [732_846_119]);
  try {
    await ensureMigrationTable(database);
    /** @type {import('./types.js').QueryResult<MigrationRow>} */
    const applied = await database.query('SELECT name FROM schema_migrations');
    const appliedNames = new Set(applied.rows.map((row) => row.name));
    const pending = migrations.filter((migration) => !appliedNames.has(migration.name));
    for (const migration of pending) {
      await database.transaction(async (transaction) => {
        await transaction.query(migration.up);
        await transaction.query(
          'INSERT INTO schema_migrations (name) VALUES ($1)',
          [migration.name]
        );
      });
    }
    return { applied: pending.map((migration) => migration.name) };
  } finally {
    await database.query('SELECT pg_advisory_unlock($1)', [732_846_119]);
  }
};

/**
 * @param {Database} database
 * @param {{steps?: number}} [options]
 */
export const migrateDown = async (database, { steps = 1 } = {}) => {
  if (!Number.isSafeInteger(steps) || steps < 1 || steps > 100) {
    throw new DatabaseError('Migration rollback steps must be between 1 and 100.', {
      code: 'DATABASE_MIGRATION_ARGUMENT_INVALID',
      expose: true
    });
  }
  const migrations = await readMigrations();
  const byName = new Map(migrations.map((migration) => [migration.name, migration]));
  await database.query('SELECT pg_advisory_lock($1)', [732_846_119]);
  try {
    await ensureMigrationTable(database);
    /** @type {import('./types.js').QueryResult<MigrationRow>} */
    const applied = await database.query(
      'SELECT name FROM schema_migrations ORDER BY applied_at DESC, name DESC LIMIT $1',
      [steps]
    );
    for (const row of applied.rows) {
      const migration = byName.get(row.name);
      if (!migration) {
        throw new DatabaseError(`Migration file is missing for ${row.name}.`, {
          code: 'DATABASE_MIGRATION_FILE_MISSING'
        });
      }
      await database.transaction(async (transaction) => {
        await transaction.query(migration.down);
        await transaction.query('DELETE FROM schema_migrations WHERE name = $1', [
          migration.name
        ]);
      });
    }
    return { rolledBack: applied.rows.map((row) => row.name) };
  } finally {
    await database.query('SELECT pg_advisory_unlock($1)', [732_846_119]);
  }
};
