import { serverConfig } from '../../config.js';
import { migrateDown, migrateUp } from '../../db/migrations.js';
import { createPostgresDatabase } from '../../db/postgres.js';
import { logger } from '../../observability/logger.js';

const database = createPostgresDatabase({
  connectionString: serverConfig.database.url,
  max: serverConfig.database.poolMax,
  idleTimeoutMs: serverConfig.database.idleTimeoutMs,
  connectionTimeoutMs: serverConfig.database.connectionTimeoutMs
});

try {
  const initial = await migrateUp(database);
  const rollback = await migrateDown(database, { steps: 100 });
  const reapplied = await migrateUp(database);
  logger.info('database.migrations.verified', {
    initialApplied: initial.applied.length,
    rolledBack: rollback.rolledBack.length,
    reapplied: reapplied.applied.length
  });
} catch (error) {
  logger.error('database.migrations.verification_failed', { error });
  process.exitCode = 1;
} finally {
  await database.close();
}
