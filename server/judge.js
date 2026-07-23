import { runCode } from './executor.js';

const serializeInput = (input) => {
  if (typeof input === 'string') return input;
  return JSON.stringify(input);
};

const normalizeOutput = (value) => {
  if (typeof value === 'string') return value.trim();
  return JSON.stringify(value);
};

const canonicalJson = (value) => {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalJson(value[key])])
    );
  }
  return value;
};

export const outputsMatch = (actual, expected) => {
  if (actual == null) return false;

  const actualText = String(actual).trim();
  const expectedText = normalizeOutput(expected);

  if (actualText === expectedText) return true;

  try {
    const actualJson = canonicalJson(JSON.parse(actualText));
    const expectedJson = canonicalJson(
      typeof expected === 'string' ? JSON.parse(expected) : expected
    );
    return JSON.stringify(actualJson) === JSON.stringify(expectedJson);
  } catch {
    return false;
  }
};

export const judgeSubmission = async ({ code, language, problem }) => {
  const testCases =
    problem.testCases ??
    [...(problem.visibleTests || []), ...(problem.hiddenTests || [])];
  const timeLimitMs = Math.min(
    30_000,
    Math.max(100, Number(problem.timeLimitMs) || 5_000)
  );
  let lastExecution = null;
  let passedCount = 0;
  let runtimeMs = 0;
  let peakMemoryBytes = 0;

  for (const testCase of testCases) {
    const input = serializeInput(testCase.input);
    lastExecution = await runCode(code, language, input, timeLimitMs, {
      memoryLimitMb: problem.memoryLimitMb
    });
    runtimeMs += lastExecution.runtimeMs;
    peakMemoryBytes = Math.max(
      peakMemoryBytes,
      lastExecution.peakMemoryBytes || 0
    );

    const executionSucceeded =
      !lastExecution.infrastructureError &&
      !lastExecution.timedOut &&
      !lastExecution.outputTruncated &&
      lastExecution.exitCode === 0;

    if (
      !executionSucceeded ||
      !outputsMatch(lastExecution.stdout, testCase.expectedOutput)
    ) {
      break;
    }

    passedCount += 1;
  }

  const success = testCases.length > 0 && passedCount === testCases.length;
  const characterCount = [...code].length;
  const characterBytes = Buffer.byteLength(code, 'utf8');
  const failureOutput = lastExecution?.infrastructureError
    ? 'The execution service could not run this submission.'
    : lastExecution?.timedOut
      ? `Execution exceeded the ${timeLimitMs}ms limit.`
      : lastExecution?.outputTruncated
        ? 'Program output exceeded the allowed limit.'
        : lastExecution?.stderr || lastExecution?.stdout || 'No output.';

  return {
    output: success ? (lastExecution?.stdout || 'Accepted.') : failureOutput,
    characterCount,
    characterBytes,
    runtimeMs: Math.round(runtimeMs * 100) / 100,
    memoryBytes: peakMemoryBytes || null,
    success,
    passedTests: passedCount,
    totalTests: testCases.length,
    timedOut: Boolean(lastExecution?.timedOut),
    outputTruncated: Boolean(lastExecution?.outputTruncated)
  };
};
