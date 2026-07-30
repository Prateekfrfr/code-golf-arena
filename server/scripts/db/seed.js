import { serverConfig } from '../../config.js';
import { createPostgresDatabase } from '../../db/postgres.js';
import { createPostgresProblemRepository } from '../../db/repositories/index.js';
import { logger } from '../../observability/logger.js';
import { createProblemSync } from '../../problemImport/index.js';
import { problems } from '../../../data/problems.js';

const bundledSource = {
  provider: 'local',
  locator: 'code-golf-arena/data/problems.js',
  ref: 'bundled-original-catalog-v1',
  license: {
    spdxId: 'CC0-1.0',
    attribution: 'Original Code Golf Arena problem catalog'
  }
};

const database = createPostgresDatabase({
  connectionString: serverConfig.database.url,
  max: serverConfig.database.poolMax,
  idleTimeoutMs: serverConfig.database.idleTimeoutMs,
  connectionTimeoutMs: serverConfig.database.connectionTimeoutMs
});

try {
  const repository = createPostgresProblemRepository({ database });
  const sync = createProblemSync({ repository });
  const local = await sync.sync(problems, {
    source: bundledSource
  });
  logger.info('database.seed.completed', {
    localInserted: local.inserted,
    localUpdated: local.updated,
    localUnchanged: local.unchanged
  });
} catch (error) {
  logger.error('database.seed.failed', { error });
  process.exitCode = 1;
} finally {
  await database.close();
}
