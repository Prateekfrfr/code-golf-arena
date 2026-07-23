import { cppCompressionAnalyzer } from './analyzers/cppAnalyzer.js';
import { javaCompressionAnalyzer } from './analyzers/javaAnalyzer.js';
import { javascriptCompressionAnalyzer } from './analyzers/javascriptAnalyzer.js';
import { pythonCompressionAnalyzer } from './analyzers/pythonAnalyzer.js';

const validateAnalyzer = (analyzer) => {
  if (!analyzer || typeof analyzer !== 'object') {
    throw new TypeError('analyzer must be an object');
  }

  const language = String(analyzer.language || '').trim().toLowerCase();

  if (!language) {
    throw new TypeError('analyzer.language is required');
  }

  if (typeof analyzer.analyze !== 'function') {
    throw new TypeError('analyzer.analyze must be a function');
  }

  return {
    language,
    analyze: analyzer.analyze.bind(analyzer)
  };
};

export const createCompressionAnalyzerRegistry = (initialAnalyzers = []) => {
  const analyzers = new Map();

  const register = (analyzer, { replace = false } = {}) => {
    const validated = validateAnalyzer(analyzer);

    if (analyzers.has(validated.language) && !replace) {
      throw new Error(
        `compression analyzer already registered for ${validated.language}`
      );
    }

    analyzers.set(validated.language, validated);
    return validated.language;
  };

  for (const analyzer of initialAnalyzers) {
    register(analyzer);
  }

  return Object.freeze({
    register,

    unregister(language) {
      return analyzers.delete(String(language || '').trim().toLowerCase());
    },

    has(language) {
      return analyzers.has(String(language || '').trim().toLowerCase());
    },

    languages() {
      return [...analyzers.keys()].sort();
    },

    analyze(language, source, context = {}) {
      const normalizedLanguage = String(language || '').trim().toLowerCase();
      const analyzer = analyzers.get(normalizedLanguage);

      if (!analyzer) {
        throw new RangeError(
          `no compression analyzer registered for ${normalizedLanguage || 'unknown'}`
        );
      }

      const result = analyzer.analyze(source, context);

      if (!result || !Array.isArray(result.suggestions)) {
        throw new TypeError(
          `compression analyzer for ${normalizedLanguage} returned an invalid result`
        );
      }

      return result;
    }
  });
};

export const builtinCompressionAnalyzers = Object.freeze([
  pythonCompressionAnalyzer,
  javascriptCompressionAnalyzer,
  cppCompressionAnalyzer,
  javaCompressionAnalyzer
]);

export const createDefaultCompressionAnalyzerRegistry = () =>
  createCompressionAnalyzerRegistry(builtinCompressionAnalyzers);
