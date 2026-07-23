import { createHash } from 'node:crypto';
import { normalizeProblem } from '../problems/problemSchema.js';

export const stableStringify = (value) => {
  if (value == null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(',')}}`;
};

export const fingerprintProblem = (input) => {
  const problem = normalizeProblem(input);
  const content = { ...problem };
  delete content.id;
  delete content.slug;
  delete content.version;
  return createHash('sha256').update(stableStringify(content)).digest('hex');
};
