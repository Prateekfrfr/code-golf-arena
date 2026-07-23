import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createProblemCatalog } from '../problems/catalog.js';

const DEFAULT_LIMITS = Object.freeze({
  maxFiles: 1_000,
  maxFileBytes: 512 * 1024,
  maxTotalBytes: 25 * 1024 * 1024
});

const assertContainedPath = (root, candidate) => {
  const relative = path.relative(root, candidate);
  if (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== '..' &&
      !path.isAbsolute(relative))
  ) {
    return;
  }
  throw new Error(`Path escapes problem root: ${candidate}`);
};

const collectJsonFiles = async (root, limits) => {
  const files = [];
  let totalBytes = 0;

  const visit = async (directory) => {
    assertContainedPath(root, directory);
    const entries = await fs.readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      const candidate = path.resolve(directory, entry.name);
      assertContainedPath(root, candidate);
      const stats = await fs.lstat(candidate);
      if (stats.isSymbolicLink()) {
        throw new Error(`Symbolic links are not allowed: ${candidate}`);
      }
      if (stats.isDirectory()) {
        await visit(candidate);
        continue;
      }
      if (!stats.isFile() || path.extname(entry.name).toLowerCase() !== '.json') {
        continue;
      }
      if (files.length >= limits.maxFiles) {
        throw new Error(`Problem file count exceeds ${limits.maxFiles}`);
      }
      if (stats.size > limits.maxFileBytes) {
        throw new Error(`Problem file exceeds ${limits.maxFileBytes} bytes`);
      }
      totalBytes += stats.size;
      if (totalBytes > limits.maxTotalBytes) {
        throw new Error(`Problem files exceed ${limits.maxTotalBytes} bytes`);
      }
      files.push(candidate);
    }
  };

  await visit(root);
  return files;
};

export const createFilesystemProblemProvider = ({
  rootDir,
  limits: limitOverrides = {},
  random = Math.random
}) => {
  if (!rootDir) throw new TypeError('rootDir is required');
  const root = path.resolve(rootDir);
  const limits = { ...DEFAULT_LIMITS, ...limitOverrides };
  let catalog = null;

  const load = async () => {
    const rootStats = await fs.lstat(root);
    if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) {
      throw new Error('rootDir must be a real directory');
    }
    const files = await collectJsonFiles(root, limits);
    const records = [];
    for (const file of files) {
      const text = await fs.readFile(file, 'utf8');
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch (error) {
        throw new Error(`Invalid JSON in ${file}: ${error.message}`);
      }
      if (Array.isArray(parsed)) records.push(...parsed);
      else records.push(parsed);
    }
    catalog = createProblemCatalog(records);
    return { count: catalog.size, changed: true };
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
    refresh: load
  };
};
