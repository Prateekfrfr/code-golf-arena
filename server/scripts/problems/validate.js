import { problems } from '../../../data/problems.js';
import { normalizeProblem } from '../../problems/problemSchema.js';
import { detectProblemDuplicates } from '../../problemImport/duplicateDetector.js';

const normalized = problems.map(normalizeProblem);
const { duplicates } = detectProblemDuplicates(normalized);
const blocking = duplicates.filter(
  (duplicate) => duplicate.type === 'slug-conflict'
);

if (blocking.length > 0) {
  throw new Error(
    `Problem validation found duplicate slugs: ${blocking
      .map((duplicate) => duplicate.slug)
      .join(', ')}`
  );
}

console.log(
  JSON.stringify(
    {
      valid: true,
      problems: normalized.length,
      visibleTests: normalized.reduce(
        (total, problem) => total + problem.visibleTests.length,
        0
      ),
      hiddenTests: normalized.reduce(
        (total, problem) => total + problem.hiddenTests.length,
        0
      ),
      duplicateRecords: duplicates.length
    },
    null,
    2
  )
);
