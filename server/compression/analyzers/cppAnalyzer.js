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
      /^(\s*)(?:auto|bool|char|double|float|int|long|short|string)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*[^;]+;\s*$/
    );
    const returned = lines[index + 1].match(
      /^(\s*)return\s+([A-Za-z_][A-Za-z0-9_]*)\s*;\s*$/
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

export const cppCompressionAnalyzer = Object.freeze({
  language: 'cpp',

  analyze(source) {
    const prepared = prepareSource(source);
    const standardNamespaceUses = countMatches(source, /\bstd::/g);
    const endlUses = countMatches(source, /<<\s*(?:std::)?endl\b/g);
    const returnZero =
      /\bint\s+main\s*\(/.test(source) &&
      /\breturn\s+0\s*;\s*}\s*$/.test(source)
        ? 1
        : 0;
    const redundantReturnVariables = countRedundantReturnVariables(
      prepared.lines
    );
    const namespaceSavings = Math.max(0, standardNamespaceUses * 5 - 20);

    return finishAnalysis('cpp', source, [
      ...commonWhitespaceSuggestions(prepared.lines),
      suggestion({
        id: 'cpp.standard-namespace',
        category: 'shorter-syntax',
        title: 'Review repeated std:: qualifiers',
        message:
          'Many std:: qualifiers may justify a using directive in a constrained golf submission.',
        occurrences: namespaceSavings > 0 ? standardNamespaceUses : 0,
        estimatedSavings: namespaceSavings
      }),
      suggestion({
        id: 'cpp.endl',
        category: 'shorter-syntax',
        title: 'Prefer a newline character to endl',
        message: "\\n is shorter and avoids an unnecessary stream flush.",
        occurrences: endlUses,
        estimatedSavings: endlUses * 3
      }),
      suggestion({
        id: 'cpp.main-return-zero',
        category: 'implicit-return',
        title: 'Omit return 0 from main',
        message: 'C++ supplies an implicit successful return at the end of main.',
        occurrences: returnZero,
        estimatedSavings: returnZero * 9
      }),
      suggestion({
        id: 'cpp.redundant-return-variable',
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
