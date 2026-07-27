import { serverConfig } from '../../config.js';
import { migrateDown } from '../../db/migrations.js';
import { createPostgresDatabase } from '../../db/postgres.js';
import { logger } from '../../observability/logger.js';

const rawSteps = process.argv.find((argument) => argument.startsWith('--steps='));
const steps = rawSteps ? Number(rawSteps.slice('--steps='.length)) : 1;
const database = createPostgresDatabase({
  connectionString: serverConfig.database.url,
  max: serverConfig.database.poolMax,
  idleTimeoutMs: serverConfig.database.idleTimeoutMs,
  connectionTimeoutMs: serverConfig.database.connectionTimeoutMs
});

try {
  const result = await migrateDown(database, { steps });
  logger.info('database.migrate_rollback.completed', {
    migrationCount: result.rolledBack.length
  });
} catch (error) {
  logger.error('database.migrate_rollback.failed', { error });
  process.exitCode = 1;
} finally {
  await database.close();
}
