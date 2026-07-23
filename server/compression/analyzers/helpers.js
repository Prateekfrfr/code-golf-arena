export const MAX_SOURCE_LENGTH = 100_000;

export const prepareSource = (source) => {
  if (typeof source !== 'string') {
    throw new TypeError('source must be a string');
  }

  if (source.length > MAX_SOURCE_LENGTH) {
    throw new RangeError(
      `source must not exceed ${MAX_SOURCE_LENGTH} characters`
    );
  }

  return {
    source,
    lines: source.split(/\r?\n/)
  };
};

export const suggestion = ({
  id,
  category,
  title,
  message,
  occurrences,
  estimatedSavings = 0
}) => {
  if (!Number.isSafeInteger(occurrences) || occurrences <= 0) {
    return null;
  }

  return Object.freeze({
    id,
    category,
    title,
    message,
    occurrences,
    estimatedSavings: Math.max(0, Math.trunc(estimatedSavings))
  });
};

export const commonWhitespaceSuggestions = (lines) => {
  let trailingWhitespaceCharacters = 0;
  let blankLines = 0;

  for (const line of lines) {
    const trailingWhitespace = line.match(/[ \t]+$/)?.[0].length || 0;
    trailingWhitespaceCharacters += trailingWhitespace;

    if (line.length === 0 && lines.length > 1) {
      blankLines += 1;
    }
  }

  return [
    suggestion({
      id: 'common.trailing-whitespace',
      category: 'whitespace',
      title: 'Remove trailing whitespace',
      message: 'Trailing spaces and tabs add bytes without changing behavior.',
      occurrences: trailingWhitespaceCharacters,
      estimatedSavings: trailingWhitespaceCharacters
    }),
    suggestion({
      id: 'common.blank-lines',
      category: 'whitespace',
      title: 'Remove blank lines',
      message: 'Blank lines can usually be removed from a golf submission.',
      occurrences: blankLines,
      estimatedSavings: blankLines
    })
  ].filter(Boolean);
};

export const finishAnalysis = (language, source, suggestions) => {
  const filteredSuggestions = suggestions.filter(Boolean);
  const estimatedSavings = Math.min(
    source.length,
    filteredSuggestions.reduce(
      (sum, item) => sum + item.estimatedSavings,
      0
    )
  );

  return Object.freeze({
    language,
    sourceLength: source.length,
    estimatedSavings,
    estimatedLength: Math.max(0, source.length - estimatedSavings),
    suggestions: Object.freeze(filteredSuggestions)
  });
};

export const countMatches = (source, pattern) => {
  if (!pattern.global) {
    throw new TypeError('countMatches requires a global regular expression');
  }

  return [...source.matchAll(pattern)].length;
};
