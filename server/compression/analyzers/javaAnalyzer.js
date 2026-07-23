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
      /^(\s*)(?:boolean|byte|char|double|float|int|long|short|String|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*[^;]+;\s*$/
    );
    const returned = lines[index + 1].match(
      /^(\s*)return\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*;\s*$/
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

export const javaCompressionAnalyzer = Object.freeze({
  language: 'java',

  analyze(source) {
    const prepared = prepareSource(source);
    const printCalls = countMatches(source, /\bSystem\.out\.print(?:ln)?\s*\(/g);
    const redundantStrings = countMatches(
      source,
      /\bnew\s+String\s*\("[^"\r\n]*"\)/g
    );
    const booleanComparisons = countMatches(
      source,
      /={2}\s*(?:true|false)\b/g
    );
    const redundantReturnVariables = countRedundantReturnVariables(
      prepared.lines
    );
    const staticImportSavings = Math.max(0, printCalls * 7 - 31);

    return finishAnalysis('java', source, [
      ...commonWhitespaceSuggestions(prepared.lines),
      suggestion({
        id: 'java.static-out',
        category: 'shorter-syntax',
        title: 'Review repeated System.out calls',
        message:
          'Enough print calls may justify a static import and shorter out.print calls.',
        occurrences: staticImportSavings > 0 ? printCalls : 0,
        estimatedSavings: staticImportSavings
      }),
      suggestion({
        id: 'java.redundant-string-constructor',
        category: 'shorter-syntax',
        title: 'Use the string literal directly',
        message: 'new String(\"value\") can usually be replaced by \"value\".',
        occurrences: redundantStrings,
        estimatedSavings: redundantStrings * 12
      }),
      suggestion({
        id: 'java.boolean-comparison',
        category: 'shorter-syntax',
        title: 'Review explicit boolean comparisons',
        message:
          'Comparisons to true or false can often be replaced by the value or its negation.',
        occurrences: booleanComparisons,
        estimatedSavings: booleanComparisons * 4
      }),
      suggestion({
        id: 'java.redundant-return-variable',
        category: 'redundant-variable',
        title: 'Inline a value returned immediately',
        message:
          'A simple local assigned immediately before return may be inlined.',
        occurrences: redundantReturnVariables,
        estimatedSavings: redundantReturnVariables * 4
      })
    ]);
  }
});
