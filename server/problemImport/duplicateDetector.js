import { fingerprintProblem } from './fingerprint.js';

export const detectProblemDuplicates = (problems) => {
  const bySlug = new Map();
  const byFingerprint = new Map();
  const unique = [];
  const duplicates = [];

  for (const problem of problems) {
    const fingerprint = fingerprintProblem(problem);
    const slugMatch = bySlug.get(problem.slug);
    if (slugMatch) {
      duplicates.push({
        type: slugMatch.fingerprint === fingerprint ? 'exact' : 'slug-conflict',
        slug: problem.slug,
        duplicateOf: slugMatch.problem.slug,
        fingerprint
      });
      continue;
    }
    const contentMatch = byFingerprint.get(fingerprint);
    if (contentMatch) {
      duplicates.push({
        type: 'content',
        slug: problem.slug,
        duplicateOf: contentMatch.slug,
        fingerprint
      });
      continue;
    }
    const entry = { problem, fingerprint };
    bySlug.set(problem.slug, entry);
    byFingerprint.set(fingerprint, problem);
    unique.push(entry);
  }

  return { unique, duplicates };
};
