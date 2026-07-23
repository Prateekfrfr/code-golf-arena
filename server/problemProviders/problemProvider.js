export const PROBLEM_PROVIDER_METHODS = Object.freeze([
  'getRandomProblem',
  'getBySlug',
  'getJudgeProblem',
  'listProblems'
]);

export const assertProblemProvider = (provider, name = 'provider') => {
  if (!provider || typeof provider !== 'object') {
    throw new TypeError(`${name} must be an object`);
  }
  for (const method of PROBLEM_PROVIDER_METHODS) {
    if (typeof provider[method] !== 'function') {
      throw new TypeError(`${name}.${method} must be a function`);
    }
  }
  return provider;
};
