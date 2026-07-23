import assert from 'node:assert/strict';
import test from 'node:test';
import { createGithubProblemProvider } from '../../problemProviders/githubProblemProvider.js';

const ref = 'a'.repeat(40);
const record = {
  title: 'GitHub Problem',
  statement: 'Loaded from GitHub.',
  difficulty: 'easy',
  visibleTests: [{ input: '', expectedOutput: 'ok' }],
  hiddenTests: [{ input: 'secret', expectedOutput: 'hidden' }]
};

const response = (data, {
  status = 200,
  url = `https://api.github.com/repos/acme/problems/contents/problems?ref=${ref}`,
  headers = {}
} = {}) => ({
  status,
  ok: status >= 200 && status < 300,
  url,
  headers: { get: (name) => headers[name.toLowerCase()] ?? null },
  async text() {
    return data == null ? '' : JSON.stringify(data);
  }
});

test('requires allowlisted owners and a full commit SHA', () => {
  assert.throws(
    () =>
      createGithubProblemProvider({
        owner: 'acme',
        repo: 'problems',
        ref: 'main',
        allowedOwners: ['acme'],
        fetch: async () => response([])
      }),
    /40-character commit SHA/
  );
  assert.throws(
    () =>
      createGithubProblemProvider({
        owner: 'acme',
        repo: 'problems',
        ref,
        allowedOwners: ['someone-else'],
        fetch: async () => response([])
      }),
    /not allowlisted/
  );
});

test('loads only API-hosted base64 JSON, redacts hidden tests, and honors ETag', async () => {
  let calls = 0;
  const fetch = async (_url, options) => {
    calls += 1;
    if (calls === 2) {
      assert.equal(options.headers['If-None-Match'], '"catalog-v1"');
      return response(null, { status: 304, headers: { etag: '"catalog-v1"' } });
    }
    return response(
      [
        {
          type: 'file',
          path: 'problems/github.json',
          size: 100,
          encoding: 'base64',
          content: Buffer.from(JSON.stringify(record)).toString('base64')
        }
      ],
      { headers: { etag: '"catalog-v1"' } }
    );
  };
  const provider = createGithubProblemProvider({
    owner: 'acme',
    repo: 'problems',
    ref,
    allowedOwners: ['acme'],
    fetch
  });
  const problem = await provider.getBySlug('github-problem');
  assert.equal(problem.testCases.length, 1);
  assert.equal(JSON.stringify(problem).includes('secret'), false);
  const sync = await provider.refresh();
  assert.equal(sync.changed, false);
  assert.equal(calls, 2);
});

test('rejects redirects, off-host responses, and oversized response bodies', async () => {
  const options = {
    owner: 'acme',
    repo: 'problems',
    ref,
    allowedOwners: ['acme']
  };
  const redirecting = createGithubProblemProvider({
    ...options,
    fetch: async () => response(null, { status: 302 })
  });
  await assert.rejects(redirecting.listProblems(), /redirects are not allowed/);

  const offHost = createGithubProblemProvider({
    ...options,
    fetch: async () =>
      response([], { url: 'https://metadata.internal/catalog' })
  });
  await assert.rejects(offHost.listProblems(), /response host is not allowlisted/);

  const oversized = createGithubProblemProvider({
    ...options,
    limits: { maxResponseBytes: 5 },
    fetch: async () => response([{ type: 'dir', path: 'problems/nested' }])
  });
  await assert.rejects(oversized.listProblems(), /response exceeds/);
});

test('aborts requests that exceed the configured timeout', async () => {
  const provider = createGithubProblemProvider({
    owner: 'acme',
    repo: 'problems',
    ref,
    allowedOwners: ['acme'],
    limits: { timeoutMs: 5 },
    fetch: (_url, { signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted')));
      })
  });
  await assert.rejects(provider.listProblems(), /timed out/);
});
