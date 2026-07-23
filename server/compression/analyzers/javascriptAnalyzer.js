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
      /^(\s*)(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(.+);?\s*$/
    );
    const returned = lines[index + 1].match(
      /^(\s*)return\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*;?\s*$/
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

export const javascriptCompressionAnalyzer = Object.freeze({
  language: 'javascript',

  analyze(source) {
    const prepared = prepareSource(source);
    const terminalSemicolons = prepared.lines.filter((line) =>
      /;[ \t]*$/.test(line)
    ).length;
    const implicitArrowReturns = countMatches(
      source,
      /=>\s*\{\s*return\s+[^{};\r\n]+;?\s*\}/g
    );
    const redundantReturnVariables = countRedundantReturnVariables(
      prepared.lines
    );
    const booleanComparisons = countMatches(
      source,
      /={2,3}\s*(?:true|false)\b/g
    );

    return finishAnalysis('javascript', source, [
      ...commonWhitespaceSuggestions(prepared.lines),
      suggestion({
        id: 'javascript.terminal-semicolon',
        category: 'semicolon',
        title: 'Review terminal semicolons',
        message:
          'Many JavaScript semicolons are optional, but remove them only where ASI is unambiguous.',
        occurrences: terminalSemicolons,
        estimatedSavings: terminalSemicolons
      }),
      suggestion({
        id: 'javascript.implicit-arrow-return',
        category: 'implicit-return',
        title: 'Use an implicit arrow return',
        message: 'An arrow body containing only return can use expression syntax.',
        occurrences: implicitArrowReturns,
        estimatedSavings: implicitArrowReturns * 8
      }),
      suggestion({
        id: 'javascript.redundant-return-variable',
        category: 'redundant-variable',
        title: 'Inline a value returned immediately',
        message:
          'A const, let, or var assigned immediately before return may be inlined.',
        occurrences: redundantReturnVariables,
        estimatedSavings: redundantReturnVariables * 5
      }),
      suggestion({
        id: 'javascript.boolean-comparison',
        category: 'shorter-syntax',
        title: 'Review explicit boolean comparisons',
        message:
          'Comparisons to true or false can often be replaced by the value or its negation.',
        occurrences: booleanComparisons,
        estimatedSavings: booleanComparisons * 4
      })
    ]);
  }
});
