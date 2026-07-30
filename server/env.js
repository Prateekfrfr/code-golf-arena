import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = fileURLToPath(new URL('../', import.meta.url));
export const rootEnvPath = path.join(rootDir, '.env');
export const rootEnvLocalPath = path.join(rootDir, '.env.local');

let loaded = false;

export const loadEnv = () => {
  if (loaded) return;
  loaded = true;

  // Node's process.loadEnvFile does not overwrite existing process.env variables.
  // Therefore, loading .env.local first allows local overrides to take precedence
  // over .env, while pre-existing shell/CI environment variables are preserved.
  if (fs.existsSync(rootEnvLocalPath)) {
    try {
      process.loadEnvFile(rootEnvLocalPath);
    } catch {
      // Ignore read errors if .env.local is invalid or unreadable
    }
  }

  if (fs.existsSync(rootEnvPath)) {
    try {
      process.loadEnvFile(rootEnvPath);
    } catch {
      // Ignore read errors if .env is invalid or unreadable
    }
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
    `2. Or set ${varName} in your shell environment.`
  ].join('\n');
};
