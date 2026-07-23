import assert from 'node:assert/strict';
import { mkdtemp, mkdir, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createFilesystemProblemProvider } from '../../problemProviders/filesystemProblemProvider.js';

const record = {
  title: 'Filesystem Problem',
  statement: 'Loaded from a JSON file.',
  difficulty: 'easy',
  visibleTests: [{ input: '', expectedOutput: 'ok' }],
  hiddenTests: [{ input: 'secret', expectedOutput: 'hidden' }]
};

test('loads bounded JSON files and exposes separate public and judge views', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'golf-problems-'));
  await mkdir(path.join(root, 'nested'));
  await writeFile(
    path.join(root, 'nested', 'problem.json'),
    JSON.stringify(record),
    'utf8'
  );
  const provider = createFilesystemProblemProvider({ rootDir: root });
  const publicProblem = await provider.getBySlug('filesystem-problem');
  const judgeProblem = await provider.getJudgeProblem('filesystem-problem');
  assert.equal(publicProblem.testCases.length, 1);
  assert.equal(judgeProblem.testCases.length, 2);
});

test('rejects symbolic links and oversized files', async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'golf-problems-'));
  const outside = await mkdtemp(path.join(os.tmpdir(), 'golf-outside-'));
  await writeFile(path.join(outside, 'problem.json'), JSON.stringify(record), 'utf8');
  try {
    await symlink(outside, path.join(root, 'escape'), 'junction');
  } catch (error) {
    context.skip(`Symlink creation is unavailable: ${error.message}`);
    return;
  }
  const provider = createFilesystemProblemProvider({ rootDir: root });
  await assert.rejects(provider.listProblems(), /Symbolic links are not allowed/);

  const sizeRoot = await mkdtemp(path.join(os.tmpdir(), 'golf-problems-'));
  await writeFile(path.join(sizeRoot, 'large.json'), JSON.stringify(record), 'utf8');
  const bounded = createFilesystemProblemProvider({
    rootDir: sizeRoot,
    limits: { maxFileBytes: 10 }
  });
  await assert.rejects(bounded.listProblems(), /file exceeds/);
});
