const metricAliases = Object.freeze({
  characterCount: ['characterCount', 'charCount', 'characterBytes'],
  runtimeMs: ['runtimeMs', 'runtime'],
  memoryBytes: ['memoryBytes', 'memory'],
  compressionScore: ['compressionScore', 'compressionRatio']
});

const readMetric = (record, aliases) => {
  for (const alias of aliases) {
    if (record[alias] !== undefined && record[alias] !== null) {
      const value = record[alias];

      if (!Number.isFinite(value) || value < 0) {
        throw new TypeError(`${alias} must be a non-negative finite number`);
      }

      return Math.round(value);
    }
  }

  return null;
};

const normalizeTimestamp = (value, index) => {
  if (value instanceof Date) {
    const timestamp = value.getTime();

    if (Number.isFinite(timestamp)) return timestamp;
  }

  if (typeof value === 'string') {
    const timestamp = Date.parse(value);

    if (Number.isFinite(timestamp)) return timestamp;
  }

  if (Number.isFinite(value)) {
    return Math.round(value);
  }

  throw new TypeError(
    `submissions[${index}] must include a valid submittedAt or createdAt`
  );
};

const normalizeSubmission = (record, index) => {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new TypeError(`submissions[${index}] must be an object`);
  }

  const status =
    record.success === true || String(record.status).toLowerCase() === 'accepted'
      ? 'accepted'
      : 'rejected';
  const score =
    record.score === undefined || record.score === null
      ? null
      : readMetric(record, ['score']);

  return Object.freeze({
    id: String(record.id ?? record.submissionId ?? `submission-${index}`),
    userId: String(record.userId ?? `guest-${index}`),
    problemId:
      record.problemId === undefined || record.problemId === null
        ? null
        : String(record.problemId),
    language: String(record.language || 'unknown').trim().toLowerCase(),
    status,
    score,
    characterCount: readMetric(record, metricAliases.characterCount),
    runtimeMs: readMetric(record, metricAliases.runtimeMs),
    memoryBytes: readMetric(record, metricAliases.memoryBytes),
    compressionScore: readMetric(record, metricAliases.compressionScore),
    submittedAt: normalizeTimestamp(
      record.submittedAt ?? record.createdAt,
      index
    )
  });
};

const metricOrWorst = (value) => (value === null ? Number.MAX_SAFE_INTEGER : value);

export const compareSubmissionPerformance = (left, right) => {
  if (left.status !== right.status) {
    return left.status === 'accepted' ? -1 : 1;
  }

  const leftScore = left.score ?? Number.MIN_SAFE_INTEGER;
  const rightScore = right.score ?? Number.MIN_SAFE_INTEGER;

  if (leftScore !== rightScore) {
    return leftScore > rightScore ? -1 : 1;
  }

  const characterDifference =
    metricOrWorst(left.characterCount) - metricOrWorst(right.characterCount);
  if (characterDifference !== 0) return characterDifference;

  const runtimeDifference =
    metricOrWorst(left.runtimeMs) - metricOrWorst(right.runtimeMs);
  if (runtimeDifference !== 0) return runtimeDifference;

  const memoryDifference =
    metricOrWorst(left.memoryBytes) - metricOrWorst(right.memoryBytes);
  if (memoryDifference !== 0) return memoryDifference;

  if (left.submittedAt !== right.submittedAt) {
    return left.submittedAt - right.submittedAt;
  }

  return left.id.localeCompare(right.id);
};

const selectBest = (submissions) =>
  submissions.length > 0
    ? [...submissions].sort(compareSubmissionPerformance)[0]
    : null;

const averageMetric = (submissions, key) => {
  const values = submissions
    .map((submission) => submission[key])
    .filter((value) => value !== null);

  if (values.length === 0) return null;

  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
};

const buildAverages = (acceptedSubmissions) => ({
  score: averageMetric(acceptedSubmissions, 'score'),
  characterCount: averageMetric(acceptedSubmissions, 'characterCount'),
  runtimeMs: averageMetric(acceptedSubmissions, 'runtimeMs'),
  memoryBytes: averageMetric(acceptedSubmissions, 'memoryBytes'),
  compressionScore: averageMetric(acceptedSubmissions, 'compressionScore')
});

const buildBestPerUser = (submissions) => {
  const submissionsByUser = new Map();

  for (const submission of submissions) {
    const existing = submissionsByUser.get(submission.userId);

    if (!existing || compareSubmissionPerformance(submission, existing) < 0) {
      submissionsByUser.set(submission.userId, submission);
    }
  }

  return [...submissionsByUser.values()].sort(compareSubmissionPerformance);
};

const rankForUser = (leaderboard, userId) => {
  if (!userId) return null;

  const index = leaderboard.findIndex(
    (submission) => submission.userId === userId
  );

  if (index < 0) return null;

  return {
    rank: index + 1,
    population: leaderboard.length
  };
};

const percentileFromRank = (ranking) => {
  if (!ranking) return null;
  if (ranking.population <= 1) return 10_000;

  return Math.round(
    ((ranking.population - ranking.rank) * 10_000) /
      (ranking.population - 1)
  );
};

const buildLanguageSummaries = (submissions) => {
  const languages = new Map();

  for (const submission of submissions) {
    const entries = languages.get(submission.language) || [];
    entries.push(submission);
    languages.set(submission.language, entries);
  }

  return [...languages.entries()]
    .map(([language, entries]) => {
      const accepted = entries.filter((entry) => entry.status === 'accepted');

      return {
        language,
        submissions: entries.length,
        accepted: accepted.length,
        acceptanceRateBps:
          entries.length === 0
            ? 0
            : Math.round((accepted.length * 10_000) / entries.length),
        best: selectBest(accepted),
        averages: buildAverages(accepted)
      };
    })
    .sort((left, right) => left.language.localeCompare(right.language));
};

const buildTrends = (submissions) => {
  const buildTrend = (key) =>
    submissions
      .filter((submission) => submission[key] !== null)
      .map((submission) => ({
        submissionId: submission.id,
        submittedAt: submission.submittedAt,
        value: submission[key]
      }));

  return {
    score: buildTrend('score'),
    characterCount: buildTrend('characterCount'),
    runtimeMs: buildTrend('runtimeMs'),
    memoryBytes: buildTrend('memoryBytes'),
    compressionScore: buildTrend('compressionScore')
  };
};

const metricDelta = (current, reference) =>
  current === null || reference === null ? null : current - reference;

const buildComparison = (target, personalBest, globalBest) => {
  if (!target || target.status !== 'accepted') return null;

  return {
    scoreFromPersonalBest: metricDelta(target.score, personalBest?.score ?? null),
    scoreFromGlobalBest: metricDelta(target.score, globalBest?.score ?? null),
    charactersFromGlobalBest: metricDelta(
      target.characterCount,
      globalBest?.characterCount ?? null
    ),
    runtimeMsFromGlobalBest: metricDelta(
      target.runtimeMs,
      globalBest?.runtimeMs ?? null
    ),
    memoryBytesFromGlobalBest: metricDelta(
      target.memoryBytes,
      globalBest?.memoryBytes ?? null
    )
  };
};

export const buildSubmissionAnalytics = (
  submissionRecords,
  {
    userId = null,
    problemId = null,
    submissionId = null,
    previousAttemptsLimit = 20
  } = {}
) => {
  if (!Array.isArray(submissionRecords)) {
    throw new TypeError('submissionRecords must be an array');
  }

  if (
    !Number.isSafeInteger(previousAttemptsLimit) ||
    previousAttemptsLimit < 0 ||
    previousAttemptsLimit > 100
  ) {
    throw new RangeError('previousAttemptsLimit must be between 0 and 100');
  }

  const normalizedUserId = userId === null ? null : String(userId);
  const normalizedProblemId = problemId === null ? null : String(problemId);
  const normalizedSubmissionId =
    submissionId === null ? null : String(submissionId);
  const normalized = submissionRecords
    .map(normalizeSubmission)
    .filter(
      (submission) =>
        normalizedProblemId === null ||
        submission.problemId === normalizedProblemId
    )
    .sort((left, right) => {
      if (left.submittedAt !== right.submittedAt) {
        return left.submittedAt - right.submittedAt;
      }

      return left.id.localeCompare(right.id);
    });
  const selectedUserSubmissions =
    normalizedUserId === null
      ? normalized
      : normalized.filter(
          (submission) => submission.userId === normalizedUserId
        );
  const targetSubmission =
    normalizedSubmissionId === null
      ? (selectedUserSubmissions.at(-1) ?? null)
      : (selectedUserSubmissions.find(
          (submission) => submission.id === normalizedSubmissionId
        ) ?? null);
  const targetUserId = normalizedUserId ?? targetSubmission?.userId ?? null;
  const targetUserSubmissions =
    targetUserId === null
      ? []
      : normalized.filter(
          (submission) => submission.userId === targetUserId
        );
  const accepted = normalized.filter(
    (submission) => submission.status === 'accepted'
  );
  const acceptedForUser = targetUserSubmissions.filter(
    (submission) => submission.status === 'accepted'
  );
  const globalBest = selectBest(accepted);
  const personalBest = selectBest(acceptedForUser);
  const targetLanguage = targetSubmission?.language ?? null;
  const acceptedForLanguage =
    targetLanguage === null
      ? []
      : accepted.filter(
          (submission) => submission.language === targetLanguage
        );
  const globalLeaderboard = buildBestPerUser(accepted);
  const languageLeaderboard = buildBestPerUser(acceptedForLanguage);
  const globalRanking = rankForUser(globalLeaderboard, targetUserId);
  const languageRanking = rankForUser(languageLeaderboard, targetUserId);
  const targetIndex = targetSubmission
    ? targetUserSubmissions.findIndex(
        (submission) => submission.id === targetSubmission.id
      )
    : -1;
  const previousAttempts =
    targetIndex < 0
      ? []
      : targetUserSubmissions
          .slice(0, targetIndex)
          .reverse()
          .slice(0, previousAttemptsLimit);

  return {
    scope: {
      userId: targetUserId,
      problemId: normalizedProblemId
    },
    targetSubmission,
    totals: {
      submissions: normalized.length,
      accepted: accepted.length,
      rejected: normalized.length - accepted.length,
      acceptanceRateBps:
        normalized.length === 0
          ? 0
          : Math.round((accepted.length * 10_000) / normalized.length)
    },
    userTotals: {
      submissions: targetUserSubmissions.length,
      accepted: acceptedForUser.length,
      rejected: targetUserSubmissions.length - acceptedForUser.length,
      acceptanceRateBps:
        targetUserSubmissions.length === 0
          ? 0
          : Math.round(
              (acceptedForUser.length * 10_000) /
                targetUserSubmissions.length
            )
    },
    averages: buildAverages(accepted),
    userAverages: buildAverages(acceptedForUser),
    globalBest,
    personalBest,
    languageBest: selectBest(acceptedForLanguage),
    percentileBps: percentileFromRank(globalRanking),
    globalRanking,
    languageRanking,
    previousAttempts,
    trends: buildTrends(targetUserSubmissions),
    timeline: targetUserSubmissions,
    byLanguage: buildLanguageSummaries(normalized),
    performanceComparison: buildComparison(
      targetSubmission,
      personalBest,
      globalBest
    )
  };
};
