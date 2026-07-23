import { createProblemCatalog } from '../problems/catalog.js';

const NAME_PATTERN = /^[A-Za-z0-9_.-]{1,100}$/;
const COMMIT_SHA_PATTERN = /^[a-f0-9]{40}$/i;
const DEFAULT_LIMITS = Object.freeze({
  maxFiles: 1_000,
  maxFileBytes: 512 * 1024,
  maxTotalBytes: 25 * 1024 * 1024,
  maxResponseBytes: 2 * 1024 * 1024,
  timeoutMs: 10_000
});

const encodeGitHubPath = (value) =>
  String(value || '')
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');

const assertSafeRepositoryPath = (value) => {
  const segments = String(value || '').split('/').filter(Boolean);
  if (segments.some((segment) => segment === '.' || segment === '..')) {
    throw new Error('GitHub problem path cannot contain dot segments');
  }
  return segments.join('/');
};

const headerValue = (headers, name) =>
  typeof headers?.get === 'function' ? headers.get(name) : null;

export const createGithubProblemProvider = ({
  owner,
  repo,
  ref,
  path = 'problems',
  apiHost = 'api.github.com',
  allowedHosts = ['api.github.com'],
  allowedOwners,
  fetch: fetchImpl = globalThis.fetch,
  limits: limitOverrides = {},
  random = Math.random,
  userAgent = 'code-golf-arena-problem-sync'
}) => {
  if (!NAME_PATTERN.test(owner || '')) throw new TypeError('Invalid GitHub owner');
  if (!NAME_PATTERN.test(repo || '')) throw new TypeError('Invalid GitHub repository');
  if (!COMMIT_SHA_PATTERN.test(ref || '')) {
    throw new TypeError('GitHub ref must be a full 40-character commit SHA');
  }
  const ownerAllowlist = new Set(
    (allowedOwners || []).map((item) => String(item).toLowerCase())
  );
  if (!ownerAllowlist.size || !ownerAllowlist.has(owner.toLowerCase())) {
    throw new Error(`GitHub owner is not allowlisted: ${owner}`);
  }
  const hostAllowlist = new Set(
    allowedHosts.map((item) => String(item).toLowerCase())
  );
  if (!hostAllowlist.has(String(apiHost).toLowerCase())) {
    throw new Error(`GitHub API host is not allowlisted: ${apiHost}`);
  }
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch must be a function');

  const rootPath = assertSafeRepositoryPath(path);
  const limits = { ...DEFAULT_LIMITS, ...limitOverrides };
  const baseUrl = new URL(
    `https://${apiHost}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/`
  );
  let catalog = null;
  let etag = null;

  const requestJson = async (repositoryPath, { ifNoneMatch } = {}) => {
    const safePath = assertSafeRepositoryPath(repositoryPath);
    const url = new URL(encodeGitHubPath(safePath), baseUrl);
    url.searchParams.set('ref', ref);
    if (!hostAllowlist.has(url.hostname.toLowerCase())) {
      throw new Error(`GitHub request host is not allowlisted: ${url.hostname}`);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), limits.timeoutMs);
    let response;
    try {
      response = await fetchImpl(url, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': userAgent,
          'X-GitHub-Api-Version': '2022-11-28',
          ...(ifNoneMatch ? { 'If-None-Match': ifNoneMatch } : {})
        }
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(`GitHub request timed out after ${limits.timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }

    if (response.url) {
      const responseUrl = new URL(response.url);
      if (!hostAllowlist.has(responseUrl.hostname.toLowerCase())) {
        throw new Error(`GitHub response host is not allowlisted: ${responseUrl.hostname}`);
      }
    }
    if (response.status === 304) {
      return { notModified: true, etag: headerValue(response.headers, 'etag') };
    }
    if (response.status >= 300 && response.status < 400) {
      throw new Error('GitHub redirects are not allowed');
    }
    if (!response.ok) {
      throw new Error(`GitHub request failed with status ${response.status}`);
    }

    const contentLength = Number(headerValue(response.headers, 'content-length'));
    if (Number.isFinite(contentLength) && contentLength > limits.maxResponseBytes) {
      throw new Error(`GitHub response exceeds ${limits.maxResponseBytes} bytes`);
    }
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > limits.maxResponseBytes) {
      throw new Error(`GitHub response exceeds ${limits.maxResponseBytes} bytes`);
    }
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error('GitHub returned invalid JSON');
    }
    return { data, etag: headerValue(response.headers, 'etag') };
  };

  const load = async () => {
    const first = await requestJson(rootPath, { ifNoneMatch: etag });
    if (first.notModified) {
      if (!catalog) throw new Error('GitHub returned 304 before a catalog was cached');
      return { count: catalog.size, changed: false, etag };
    }

    const records = [];
    let fileCount = 0;
    let totalBytes = 0;

    const visit = async (repositoryPath, initialData) => {
      const response = initialData == null
        ? await requestJson(repositoryPath)
        : { data: initialData };
      const entries = Array.isArray(response.data) ? response.data : [response.data];

      for (const entry of entries) {
        if (!entry || typeof entry !== 'object') {
          throw new Error('GitHub contents response contains an invalid entry');
        }
        const entryPath = assertSafeRepositoryPath(entry.path);
        if (
          entryPath !== rootPath &&
          !entryPath.startsWith(`${rootPath}/`)
        ) {
          throw new Error(`GitHub entry escapes configured path: ${entryPath}`);
        }
        if (entry.type === 'dir') {
          await visit(entryPath);
          continue;
        }
        if (entry.type !== 'file' || !entryPath.toLowerCase().endsWith('.json')) {
          continue;
        }
        fileCount += 1;
        if (fileCount > limits.maxFiles) {
          throw new Error(`GitHub problem file count exceeds ${limits.maxFiles}`);
        }
        if (Number(entry.size) > limits.maxFileBytes) {
          throw new Error(`GitHub problem file exceeds ${limits.maxFileBytes} bytes`);
        }

        const fileResponse = entry.content
          ? { data: entry }
          : await requestJson(entryPath);
        const file = fileResponse.data;
        if (file.encoding !== 'base64' || typeof file.content !== 'string') {
          throw new Error(`GitHub problem file is not base64 encoded: ${entryPath}`);
        }
        const encoded = file.content.replace(/\s/g, '');
        if (
          encoded.length % 4 !== 0 ||
          !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
            encoded
          )
        ) {
          throw new Error(`GitHub problem file has invalid base64: ${entryPath}`);
        }
        const bytes = Buffer.from(encoded, 'base64');
        if (bytes.length > limits.maxFileBytes) {
          throw new Error(`GitHub problem file exceeds ${limits.maxFileBytes} bytes`);
        }
        totalBytes += bytes.length;
        if (totalBytes > limits.maxTotalBytes) {
          throw new Error(`GitHub problem files exceed ${limits.maxTotalBytes} bytes`);
        }

        let parsed;
        try {
          parsed = JSON.parse(bytes.toString('utf8'));
        } catch (error) {
          throw new Error(`Invalid JSON in ${entryPath}: ${error.message}`);
        }
        if (Array.isArray(parsed)) records.push(...parsed);
        else records.push(parsed);
      }
    };

    await visit(rootPath, first.data);
    const nextCatalog = createProblemCatalog(records);
    catalog = nextCatalog;
    etag = first.etag || etag;
    return { count: catalog.size, changed: true, etag };
  };

  const ready = async () => {
    if (!catalog) await load();
    return catalog;
  };

  return {
    async getRandomProblem(topicOrFilter) {
      const filter =
        typeof topicOrFilter === 'object' && topicOrFilter !== null
          ? topicOrFilter
          : { topic: String(topicOrFilter || '').trim().toLowerCase() };
      return (await ready()).getRandomProblem(filter, random);
    },
    async getBySlug(slug) {
      return (await ready()).getBySlug(slug);
    },
    async getJudgeProblem(slug) {
      return (await ready()).getBySlug(slug, { judge: true });
    },
    async listProblems(query) {
      return (await ready()).listProblems(query);
    },
    refresh: load,
    getSyncState() {
      return { etag, ref, owner, repo, path: rootPath };
    }
  };
};
