import assert from 'node:assert/strict';
import test from 'node:test';
import { createAlfaProblemProvider } from '../../problemProviders/alfa/alfaProblemProvider.js';

const now = () => new Date('2026-07-25T00:00:00.000Z');
const sourceKey = 'alfa:http://alfa.local';
const raw = {
  title: 'Two Sum',
  titleSlug: 'two-sum',
  difficulty: 'EASY',
  questionId: '1'
};

const createRepository = (record = null) => ({
  async getBySlug() {
    return record;
  },
  async listProblems() {
    return { items: record ? [record] : [], nextCursor: null, total: record ? 1 : 0 };
  }
});

test('Alfa provider returns a fresh restricted cache hit without requesting upstream', async () => {
  let upstreamCalls = 0;
  let syncCalls = 0;
  const provider = createAlfaProblemProvider({
    client: {
      async fetchBySlug() {
        upstreamCalls += 1;
        return raw;
      },
      async fetchList() {
        return { items: [], nextCursor: null, total: 0 };
      }
    },
    repository: createRepository({
      sourceKey,
      cacheVersion: '1',
      fetchedAt: '2026-07-24T00:00:00.000Z',
      problem: {
        title: 'Two Sum',
        slug: 'two-sum',
        difficulty: 'easy',
        topic: 'general',
        tags: [],
        supportedLanguages: ['python'],
        visibleTests: [],
        hiddenTests: [],
        metadata: { alfa: { fetchedAt: '2026-07-24T00:00:00.000Z', cacheVersion: '1' } },
        provenance: {
          state: 'RESTRICTED_METADATA_ONLY',
          attribution: 'LeetCode',
          canonicalUrl: 'https://leetcode.com/problems/two-sum/'
        },
        version: '1'
      }
    }),
    sourceLocator: 'http://alfa.local',
    cacheTtlDays: 7,
    cacheVersion: '1',
    storeFullContent: false,
    now,
    sync: { async sync() { syncCalls += 1; } }
  });

  const result = await provider.getBySlug('two-sum');
  assert.equal(result.canonicalUrl, 'https://leetcode.com/problems/two-sum/');
  assert.equal('statement' in result, false);
  assert.equal(upstreamCalls, 0);
  assert.equal(syncCalls, 0);
});

test('Alfa provider refreshes an expired cache through the existing sync boundary', async () => {
  let synced = null;
  const provider = createAlfaProblemProvider({
    client: {
      async fetchBySlug() {
        return raw;
      },
      async fetchList() {
        return { items: [], nextCursor: null, total: 0 };
      }
    },
    repository: createRepository({
      sourceKey,
      cacheVersion: '1',
      fetchedAt: '2026-07-01T00:00:00.000Z',
      problem: raw
    }),
    sourceLocator: 'http://alfa.local',
    cacheTtlDays: 7,
    cacheVersion: '1',
    storeFullContent: false,
    now,
    sync: { async sync(records, options) { synced = { records, options }; } }
  });

  const result = await provider.getBySlug('two-sum');
  assert.equal(result.slug, 'two-sum');
  assert.equal(synced.records.length, 1);
  assert.equal(synced.options.archiveMissing, false);
  assert.equal(synced.records[0].provenance.state, 'RESTRICTED_METADATA_ONLY');
});
