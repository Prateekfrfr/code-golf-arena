import {
  commonWhitespaceSuggestions,
  countMatches,
  finishAnalysis,
  prepareSource,
  suggestion
} from './helpers.js';

const countRedundantReturnVariables = (lines) => {
  let count = 0;

  for (let index = 0; index < lines.length - 1; index += 1) {
    const assignment = lines[index].match(
      /^(\s*)([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/
    );
    const returned = lines[index + 1].match(
      /^(\s*)return\s+([A-Za-z_][A-Za-z0-9_]*)\s*$/
    );

    if (
      assignment &&
      returned &&
      assignment[1] === returned[1] &&
      assignment[2] === returned[2]
    ) {
      count += 1;
    }
  }

  return count;
};

export const pythonCompressionAnalyzer = Object.freeze({
  language: 'python',

  analyze(source) {
    const prepared = prepareSource(source);
    const terminalSemicolons = prepared.lines.filter((line) =>
      /;[ \t]*(?:#[^\r\n]*)?$/.test(line)
    ).length;
    const zeroBasedRanges = countMatches(source, /\brange\(0,\s*/g);
    const booleanComparisons = countMatches(
      source,
      /\s*==\s*(?:True|False)\b/g
    );
    const redundantReturnVariables = countRedundantReturnVariables(
      prepared.lines
    );

    return finishAnalysis('python', source, [
      ...commonWhitespaceSuggestions(prepared.lines),
      suggestion({
        id: 'python.terminal-semicolon',
        category: 'semicolon',
        title: 'Drop terminal semicolons',
        message: 'A semicolon at the end of a Python statement is redundant.',
        occurrences: terminalSemicolons,
        estimatedSavings: terminalSemicolons
      }),
      suggestion({
        id: 'python.range-zero',
        category: 'shorter-syntax',
        title: 'Use the one-argument range form',
        message: 'range(0, n) can be shortened to range(n).',
        occurrences: zeroBasedRanges,
        estimatedSavings: zeroBasedRanges * 2
      }),
      suggestion({
        id: 'python.boolean-comparison',
        category: 'shorter-syntax',
        title: 'Review explicit boolean comparisons',
        message:
          'Comparisons to True or False can often be replaced by the value or its negation.',
        occurrences: booleanComparisons,
        estimatedSavings: booleanComparisons * 5
      }),
      suggestion({
        id: 'python.redundant-return-variable',
        category: 'redundant-variable',
        title: 'Inline a value returned immediately',
        message:
          'A variable assigned on one line and returned on the next may be inlined.',
        occurrences: redundantReturnVariables,
        estimatedSavings: redundantReturnVariables * 3
      })
    ]);
  }
});
