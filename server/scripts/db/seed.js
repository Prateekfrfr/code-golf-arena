import path from 'node:path';
import { serverConfig } from '../../config.js';
import { createPostgresDatabase } from '../../db/postgres.js';
import { createPostgresProblemRepository } from '../../db/repositories/index.js';
import { logger } from '../../observability/logger.js';
import { createProblemSync } from '../../problemImport/index.js';
import { readFilesystemProblemRecords } from '../../problemProviders/filesystemProblemProvider.js';
import { problems } from '../../../data/problems.js';

const sourceConfig = serverConfig.database.seedSource;

const requireSeedSource = () => {
  const missing = [
    ['PROBLEM_SEED_SOURCE_REVISION', sourceConfig.revision],
    ['PROBLEM_SEED_SOURCE_LICENSE', sourceConfig.spdxId],
    ['PROBLEM_SEED_SOURCE_ATTRIBUTION', sourceConfig.attribution]
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missing.length) {
    throw new Error(`Seed source metadata is required: ${missing.join(', ')}`);
  }
};

const createSource = (locator) => ({
  provider: 'local',
  locator,
  ref: sourceConfig.revision,
  license: {
    spdxId: sourceConfig.spdxId,
    attribution: sourceConfig.attribution
  }
});

const database = createPostgresDatabase({
  connectionString: serverConfig.database.url,
  max: serverConfig.database.poolMax,
  idleTimeoutMs: serverConfig.database.idleTimeoutMs,
  connectionTimeoutMs: serverConfig.database.connectionTimeoutMs
});

try {
  requireSeedSource();
  const repository = createPostgresProblemRepository({ database });
  const sync = createProblemSync({ repository });
  const local = await sync.sync(problems, {
    source: createSource('code-golf-arena/data/problems.js')
  });
  let filesystem = null;
  if (serverConfig.database.seedFilesystemDir) {
    const root = path.resolve(serverConfig.database.seedFilesystemDir);
    const records = await readFilesystemProblemRecords({ rootDir: root });
    filesystem = await sync.sync(records, { source: createSource(root) });
  }
  logger.info('database.seed.completed', {
    localInserted: local.inserted,
    localUpdated: local.updated,
    localUnchanged: local.unchanged,
    filesystemInserted: filesystem?.inserted ?? 0,
    filesystemUpdated: filesystem?.updated ?? 0,
    filesystemUnchanged: filesystem?.unchanged ?? 0
  });
} catch (error) {
  logger.error('database.seed.failed', { error });
  process.exitCode = 1;
} finally {
  await database.close();
}
