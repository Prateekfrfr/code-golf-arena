import { detectProblemDuplicates } from './duplicateDetector.js';
import { createLicensePolicy } from './licensePolicy.js';
import { createProblemVersion } from './versioning.js';
import { normalizeProblem } from '../problems/problemSchema.js';

const assertRepository = (repository) => {
  for (const method of [
    'getBySlug',
    'listSlugsBySource',
    'saveVersion',
    'archiveSlugs',
    'transaction'
  ]) {
    if (typeof repository?.[method] !== 'function') {
      throw new TypeError(`repository.${method} must be a function`);
    }
  }
};

const sourceKeyFor = (source) =>
  `${source.provider}:${source.locator}`;

export const createProblemSync = ({
  repository,
  licensePolicy = createLicensePolicy(),
  now = () => new Date()
}) => {
  assertRepository(repository);

  const buildPlan = async (store, records, source, duplicatePolicy) => {
    const normalized = records.map(normalizeProblem);
    const { unique, duplicates } = detectProblemDuplicates(normalized);
    const blockingDuplicates = duplicates.filter(
      (duplicate) =>
        duplicate.type === 'slug-conflict' ||
        duplicatePolicy === 'reject'
    );
    if (blockingDuplicates.length) {
      throw new Error(
        `Duplicate problems detected: ${blockingDuplicates
          .map((duplicate) => `${duplicate.slug}:${duplicate.type}`)
          .join(', ')}`
      );
    }

    const currentSlugs = new Set();
    const writes = [];
    const unchanged = [];
    for (const entry of unique) {
      currentSlugs.add(entry.problem.slug);
      const existing = await store.getBySlug(entry.problem.slug);
      if (existing?.fingerprint === entry.fingerprint) {
        unchanged.push(entry.problem.slug);
        continue;
      }
      writes.push({
        slug: entry.problem.slug,
        status: existing ? 'updated' : 'inserted',
        version: createProblemVersion({
          problem: entry.problem,
          fingerprint: entry.fingerprint,
          existing,
          source,
          importedAt: now().toISOString()
        })
      });
    }

    const previousSlugs = await store.listSlugsBySource(sourceKeyFor(source));
    const archived = previousSlugs.filter((slug) => !currentSlugs.has(slug));
    return {
      source,
      sourceKey: sourceKeyFor(source),
      writes,
      unchanged,
      archived,
      duplicates
    };
  };

  return {
    async sync(records, {
      source: sourceInput,
      dryRun = false,
      duplicatePolicy = 'skip-identical'
    } = {}) {
      if (!Array.isArray(records)) throw new TypeError('records must be an array');
      if (!['skip-identical', 'reject'].includes(duplicatePolicy)) {
        throw new TypeError('duplicatePolicy must be skip-identical or reject');
      }
      const source = licensePolicy.validate(sourceInput);

      if (dryRun) {
        const plan = await buildPlan(repository, records, source, duplicatePolicy);
        return {
          dryRun: true,
          inserted: plan.writes.filter((item) => item.status === 'inserted').length,
          updated: plan.writes.filter((item) => item.status === 'updated').length,
          unchanged: plan.unchanged.length,
          archived: plan.archived.length,
          duplicates: plan.duplicates,
          plan
        };
      }

      return repository.transaction(async (transaction) => {
        const plan = await buildPlan(
          transaction,
          records,
          source,
          duplicatePolicy
        );
        for (const write of plan.writes) {
          await transaction.saveVersion({
            slug: write.slug,
            sourceKey: plan.sourceKey,
            ...write.version
          });
        }
        if (plan.archived.length) {
          await transaction.archiveSlugs(plan.archived, {
            sourceKey: plan.sourceKey,
            archivedAt: now().toISOString()
          });
        }
        return {
          dryRun: false,
          inserted: plan.writes.filter((item) => item.status === 'inserted').length,
          updated: plan.writes.filter((item) => item.status === 'updated').length,
          unchanged: plan.unchanged.length,
          archived: plan.archived.length,
          duplicates: plan.duplicates
        };
      });
    }
  };
};
