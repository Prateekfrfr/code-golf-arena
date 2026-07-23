import { normalizeProblem } from './problemSchema.js';

const cloneJson = (value) => JSON.parse(JSON.stringify(value));

export const toPublicProblem = (input) => {
  const problem = normalizeProblem(input);
  const visibleTests = cloneJson(problem.visibleTests);
  const publicMetadata =
    problem.metadata?.public &&
    typeof problem.metadata.public === 'object' &&
    !Array.isArray(problem.metadata.public)
      ? cloneJson(problem.metadata.public)
      : {};

  return {
    ...(problem.id == null ? {} : { id: problem.id }),
    title: problem.title,
    slug: problem.slug,
    statement: problem.statement,
    description: problem.description,
    explanation: problem.explanation,
    examples: cloneJson(problem.examples),
    constraints: [...problem.constraints],
    difficulty: problem.difficulty,
    topic: problem.topic,
    tags: [...problem.tags],
    starterCode: cloneJson(problem.starterCode),
    supportedLanguages: [...problem.supportedLanguages],
    visibleTests,
    testCases: visibleTests,
    edgeCases: [...problem.edgeCases],
    timeLimitMs: problem.timeLimitMs,
    memoryLimitMb: problem.memoryLimitMb,
    metadata: publicMetadata,
    version: problem.version
  };
};

export const toJudgeProblem = (input) => {
  const problem = normalizeProblem(input);
  return {
    ...toPublicProblem(problem),
    testCases: cloneJson([...problem.visibleTests, ...problem.hiddenTests])
  };
};
