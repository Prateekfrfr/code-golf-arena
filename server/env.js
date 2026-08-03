import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = fileURLToPath(new URL('../', import.meta.url));
export const rootEnvPath = path.join(rootDir, '.env');

let loaded = false;

/**
 * Identify variable names declared by the intended root dotenv file. Node's
 * native parser remains responsible for parsing the corresponding values.
 * @param {string} contents
 * @returns {string[]}
 */
const parseRootEnvNames = (contents) => {
  const names = [];
  for (const rawLine of contents.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;
    const assignment = line.startsWith('export ') ? line.slice(7).trimStart() : line;
    const separator = assignment.indexOf('=');
    if (separator < 1) {
      throw new Error(`Invalid environment assignment in ${rootEnvPath}.`);
    }
    const name = assignment.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      throw new Error(`Invalid environment variable name "${name}" in ${rootEnvPath}.`);
    }
    names.push(name);
  }
  return names;
};

export const loadEnv = () => {
  if (loaded) return;
  loaded = true;

  if (!fs.existsSync(rootEnvPath)) return;

  let names;
  try {
    names = parseRootEnvNames(fs.readFileSync(rootEnvPath, 'utf8'));
    // process.loadEnvFile preserves existing values. Remove only the names
    // declared by the root file so it becomes the source of truth for them.
    for (const name of names) delete process.env[name];
    process.loadEnvFile(rootEnvPath);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown parse error';
    throw new Error(`Unable to load the root environment file (${rootEnvPath}): ${reason}`, { cause: error });
  }

};

// Execute environment loading immediately when this module is imported.
loadEnv();

/**
 * Formats a detailed diagnostic error message when a required environment variable is missing.
 * @param {string} varName
 * @param {string} [context]
 * @returns {string}
 */
export const formatMissingEnvError = (varName, context = '') => {
  const contextMsg = context ? ` (${context})` : '';
  return [
    `${varName} is missing.${contextMsg}`,
    '',
    'Expected:',
    'project-root/.env',
    '',
    'Current working directory:',
    process.cwd(),
    '',
    'Resolved env path:',
    rootEnvPath,
    '',
    'How to fix:',
    `1. Ensure '.env' exists at project root (${rootEnvPath}) containing ${varName}=...`,
    `2. Or set ${varName} in your shell environment when no root .env is deployed.`
  ].join('\n');
};
