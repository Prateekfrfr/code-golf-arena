import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AlfaCircuitOpenError,
  AlfaHttp4xxError,
  AlfaHttp5xxError,
  AlfaSchemaError,
  createAlfaClient
} from '../../problemProviders/alfa/index.js';

const jsonResponse = (value, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { 'content-type': 'application/json' }
});

test('Alfa client uses a fixed origin and encodes only allowlisted list filters', async () => {
  /** @type {URL[]} */
  const urls = [];
  const client = createAlfaClient({
    baseUrl: 'https://alfa.example/api/v1',
    fetch: async (url) => {
      urls.push(new URL(String(url)));
      return jsonResponse({ items: [{ id: 'one' }], nextCursor: 'next', total: 2 });
    }
  });

  const result = await client.fetchList({
    difficulty: 'Hard',
    tags: ['arrays', 'math'],
    limit: 10,
    cursor: 'page-1'
  });

  assert.deepEqual(result, {
    items: [{ id: 'one' }],
    nextCursor: 'next',
    total: 2
  });
  assert.equal(urls[0].href, 'https://alfa.example/api/v1/problems?difficulty=hard&tag=arrays&tag=math&limit=10&cursor=page-1');
  await client.fetchBySlug('sum-two-values');
  assert.equal(urls[1].href, 'https://alfa.example/api/v1/select?titleSlug=sum-two-values');
  await assert.rejects(
    () => client.fetchBySlug('../internal'),
    /slug is invalid/
  );
});

test('Alfa client rejects non-http base URLs, redirects, 4xx responses, and invalid schemas', async () => {
  assert.throws(
    () => createAlfaClient({ baseUrl: 'file:///etc/passwd' }),
    /HTTP or HTTPS/
  );

  const redirectClient = createAlfaClient({
    baseUrl: 'https://alfa.example/',
    retry: { maxRetries: 0 },
    fetch: async () => new Response('', { status: 302, headers: { location: 'https://elsewhere.example' } })
  });
  await assert.rejects(() => redirectClient.fetchList(), /redirects are not allowed/);

  const clientError = createAlfaClient({
    baseUrl: 'https://alfa.example/',
    retry: { maxRetries: 0 },
    fetch: async () => jsonResponse({ error: 'not found' }, 404)
  });
  await assert.rejects(
    () => clientError.fetchBySlug('missing'),
    (error) => error instanceof AlfaHttp4xxError && error.upstreamStatus === 404
  );

  const schemaClient = createAlfaClient({
    baseUrl: 'https://alfa.example/',
    fetch: async () => new Response('{"items":[{"__proto__":{"polluted":true}}]}', {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  });
  await assert.rejects(
    () => schemaClient.fetchList(),
    (error) => error instanceof AlfaSchemaError
  );
});

test('Alfa client retries transient upstream failures with injected jitter and resets after success', async () => {
  let calls = 0;
  /** @type {number[]} */
  const waits = [];
  const client = createAlfaClient({
    baseUrl: 'https://alfa.example/',
    retry: { maxRetries: 2, baseDelayMs: 40, maxDelayMs: 100 },
    random: () => 0.5,
    sleep: async (milliseconds) => { waits.push(milliseconds); },
    fetch: async () => {
      calls += 1;
      return calls === 1
        ? jsonResponse({ error: 'temporary' }, 503)
        : jsonResponse({ problem: { slug: 'sum' } });
    }
  });

  assert.deepEqual(await client.fetchBySlug('sum'), { slug: 'sum' });
  assert.equal(calls, 2);
  assert.deepEqual(waits, [20]);
  assert.equal(client.getState().consecutiveFailures, 0);
});

test('Alfa client opens a shared circuit after terminal transient failures', async () => {
  let requests = 0;
  let clock = 1_000;
  const client = createAlfaClient({
    baseUrl: 'https://alfa.example/',
    retry: { maxRetries: 0 },
    circuitBreaker: { failureThreshold: 2, cooldownMs: 500 },
    now: () => clock,
    fetch: async () => {
      requests += 1;
      return jsonResponse({ error: 'temporary' }, 503);
    }
  });

  await assert.rejects(() => client.fetchList(), AlfaHttp5xxError);
  await assert.rejects(() => client.fetchList(), AlfaHttp5xxError);
  await assert.rejects(() => client.fetchList(), AlfaCircuitOpenError);
  assert.equal(requests, 2);
  assert.equal(client.getState().circuitOpenUntil, 1_500);

  clock = 1_501;
  await assert.rejects(() => client.fetchList(), AlfaHttp5xxError);
  assert.equal(requests, 3);
});

test('Alfa client shares one concurrency queue across calls', async () => {
  /** @type {Array<() => void>} */
  const releases = [];
  let active = 0;
  let peak = 0;
  const client = createAlfaClient({
    baseUrl: 'https://alfa.example/',
    concurrency: 1,
    fetch: async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => releases.push(resolve));
      active -= 1;
      return jsonResponse({ problem: { slug: 'one' } });
    }
  });

  const first = client.fetchBySlug('one');
  const second = client.fetchBySlug('two');
  assert.equal(client.getState().active, 1);
  assert.equal(client.getState().queued, 1);
  releases.shift()?.();
  await first;
  releases.shift()?.();
  await second;
  assert.equal(peak, 1);
});
