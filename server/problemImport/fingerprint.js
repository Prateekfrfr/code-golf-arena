import { createHash } from 'node:crypto';
import { normalizeProblem } from '../problems/problemSchema.js';

/** @param {unknown} value @returns {string} */
export const stableStringify = (value) => {
  if (value == null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const record = /** @type {Record<string, unknown>} */ (value);
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
};

/** @param {unknown} input @returns {string} */
export const fingerprintProblem = (input) => {
  const problem = normalizeProblem(input);
  const content = Object.fromEntries(
    Object.entries(problem).filter(
      ([key]) => key !== 'id' && key !== 'slug' && key !== 'version'
    )
  );
  return createHash('sha256').update(stableStringify(content)).digest('hex');
};
