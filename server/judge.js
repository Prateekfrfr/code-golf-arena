import { runCode } from './executor.js';

const serializeInput = (input) => {
  if (typeof input === 'string') return input;
  return JSON.stringify(input);
};

const normalizeOutput = (value) => {
  if (typeof value === 'string') return value.trim();
  return JSON.stringify(value);
};

export const outputsMatch = (actual, expected) => {
  if (actual == null) return false;

  const actualText = String(actual).trim();
  const expectedText = normalizeOutput(expected);

  if (actualText === expectedText) return true;

  try {
    return JSON.stringify(JSON.parse(actualText)) === JSON.stringify(expected);
  } catch {
    return false;
  }
};

export const judgeSubmission = async ({ code, language, problem }) => {
  let lastOutput = '';
  let allPassed = true;

  for (const testCase of problem.testCases) {
    const input = serializeInput(testCase.input);
    lastOutput = await runCode(code, language, input);

    if (!outputsMatch(lastOutput, testCase.expectedOutput)) {
      allPassed = false;
      break;
    }
  }

  return {
    output: lastOutput,
    characterCount: code.length,
    success: allPassed
  };
};
