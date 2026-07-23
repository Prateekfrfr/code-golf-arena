import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  createLicensePolicy,
  createProblemSync,
  detectProblemDuplicates,
  fingerprintProblem
} from '../../problemImport/index.js';
import { normalizeProblem } from '../../problems/problemSchema.js';

const fixture = async (relativePath) =>
  JSON.parse(
    await readFile(
      new URL(`../fixtures/problems/${relativePath}`, import.meta.url),
      'utf8'
    )
  );

const source = {
  provider: 'github',
  locator: 'acme/problems',
  commit: 'a'.repeat(40),
  license: {
    spdxId: 'MIT',
    attribution: 'Copyright Acme contributors'
  }
};

const createRepository = (seed = []) => {
  const state = new Map(seed.map((item) => [item.slug, structuredClone(item)]));
  const sourceSlugs = new Map();
  let transactions = 0;
  let writes = 0;
  let archives = 0;

  const methods = {
    async getBySlug(slug) {
      return state.get(slug) || null;
    },
    async listSlugsBySource(sourceKey) {
      return [...(sourceSlugs.get(sourceKey) || [])];
    },
    async saveVersion(value) {
      writes += 1;
      state.set(value.slug, {
        slug: value.slug,
        fingerprint: value.fingerprint,
        version: value.version,
        problem: value.problem
      });
      const slugs = sourceSlugs.get(value.sourceKey) || new Set();
      slugs.add(value.slug);
      sourceSlugs.set(value.sourceKey, slugs);
    },
    async archiveSlugs(slugs) {
      archives += slugs.length;
      for (const slug of slugs) state.delete(slug);
    },
    async transaction(work) {
      transactions += 1;
      return work(methods);
    }
  };

  return {
    ...methods,
    state,
    sourceSlugs,
    metrics: () => ({ transactions, writes, archives })
  };
};

test('fingerprints are deterministic and duplicate detection catches content copies', async () => {
  const problem = await fixture('valid/full-problem.json');
  assert.equal(fingerprintProblem(problem), fingerprintProblem(structuredClone(problem)));

  const duplicates = (await fixture('duplicates/add-copy.json')).map(normalizeProblem);
  const result = detectProblemDuplicates(duplicates);
  assert.equal(result.unique.length, 1);
  assert.equal(result.duplicates[0].type, 'content');
});

test('sync inserts immutable versions, reports unchanged records, and supports dry-run', async () => {
  const repository = createRepository();
  const sync = createProblemSync({
    repository,
    now: () => new Date('2026-01-01T00:00:00.000Z')
  });
  const problem = await fixture('valid/full-problem.json');

  const dryRun = await sync.sync([problem], { source, dryRun: true });
  assert.equal(dryRun.inserted, 1);
  assert.deepEqual(repository.metrics(), {
    transactions: 0,
    writes: 0,
    archives: 0
  });

  const inserted = await sync.sync([problem], { source });
  assert.equal(inserted.inserted, 1);
  assert.equal(repository.state.get('add-two-integers').version, 1);

  const unchanged = await sync.sync([problem], { source });
  assert.equal(unchanged.unchanged, 1);
  assert.equal(repository.metrics().writes, 1);

  const changed = { ...problem, explanation: 'A changed explanation.' };
  const updated = await sync.sync([changed], { source });
  assert.equal(updated.updated, 1);
  assert.equal(repository.state.get('add-two-integers').version, 2);
});

test('sync archives source records missing from the next snapshot', async () => {
  const repository = createRepository();
  const sync = createProblemSync({ repository });
  const problem = await fixture('valid/full-problem.json');
  await sync.sync([problem], { source });
  const result = await sync.sync([], { source });
  assert.equal(result.archived, 1);
  assert.equal(repository.state.has('add-two-integers'), false);
});

test('licensing policy rejects unapproved or unattributed sources before writes', async () => {
  const repository = createRepository();
  const sync = createProblemSync({
    repository,
    licensePolicy: createLicensePolicy()
  });
  const problem = await fixture('valid/full-problem.json');
  await assert.rejects(
    sync.sync([problem], {
      source: {
        ...source,
        license: { spdxId: 'Proprietary', attribution: 'Owner' }
      }
    }),
    /license is not allowed/
  );
  await assert.rejects(
    sync.sync([problem], {
      source: { ...source, license: { spdxId: 'MIT' } }
    }),
    /attribution is required/
  );
  assert.equal(repository.metrics().writes, 0);
});
