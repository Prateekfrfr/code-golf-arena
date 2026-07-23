export const nextProblemVersion = (existing) => {
  const current = Number(existing?.version ?? existing?.currentVersion ?? 0);
  if (!Number.isSafeInteger(current) || current < 0) {
    throw new Error('Existing problem version must be a non-negative integer');
  }
  return current + 1;
};

export const createProblemVersion = ({
  problem,
  fingerprint,
  existing,
  source,
  importedAt = new Date().toISOString()
}) => ({
  version: nextProblemVersion(existing),
  fingerprint,
  importedAt,
  source,
  problem: {
    ...problem,
    version: String(nextProblemVersion(existing))
  }
});
