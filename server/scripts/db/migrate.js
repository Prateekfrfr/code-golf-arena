import { serverConfig } from '../../config.js';
import { migrateUp } from '../../db/migrations.js';
import { createPostgresDatabase } from '../../db/postgres.js';
import { logger } from '../../observability/logger.js';

const database = createPostgresDatabase({
  connectionString: serverConfig.database.url,
  max: serverConfig.database.poolMax,
  idleTimeoutMs: serverConfig.database.idleTimeoutMs,
  connectionTimeoutMs: serverConfig.database.connectionTimeoutMs
});

try {
  const result = await migrateUp(database);
  logger.info('database.migrate.completed', { migrationCount: result.applied.length });
} catch (error) {
  logger.error('database.migrate.failed', { error });
  process.exitCode = 1;
} finally {
  await database.close();
}
