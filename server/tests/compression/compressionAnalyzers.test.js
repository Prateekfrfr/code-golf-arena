import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createCompressionAnalyzerRegistry,
  createDefaultCompressionAnalyzerRegistry
} from '../../compression/index.js';
import { MAX_SOURCE_LENGTH } from '../../compression/analyzers/helpers.js';

const suggestionIds = (analysis) =>
  analysis.suggestions.map((suggestion) => suggestion.id);

test('default registry exposes all supported language analyzers', () => {
  const registry = createDefaultCompressionAnalyzerRegistry();

  assert.deepEqual(registry.languages(), [
    'cpp',
    'java',
    'javascript',
    'python'
  ]);
});

test('python analyzer finds safe candidates and language-specific syntax', () => {
  const registry = createDefaultCompressionAnalyzerRegistry();
  const source = [
    'def f(n):  ',
    '    x=sum(range(0,n))',
    '    return x',
    'print(f(5));'
  ].join('\n');
  const analysis = registry.analyze('python', source);

  assert.ok(suggestionIds(analysis).includes('common.trailing-whitespace'));
  assert.ok(suggestionIds(analysis).includes('python.range-zero'));
  assert.ok(
    suggestionIds(analysis).includes('python.redundant-return-variable')
  );
  assert.ok(suggestionIds(analysis).includes('python.terminal-semicolon'));
  assert.ok(analysis.estimatedLength < analysis.sourceLength);
});

test('javascript analyzer identifies implicit returns and redundant variables', () => {
  const registry = createDefaultCompressionAnalyzerRegistry();
  const source = [
    'const f=x=> { return x+1; };',
    'function g(){',
    '  const y=2',
    '  return y;',
    '}'
  ].join('\n');
  const ids = suggestionIds(registry.analyze('javascript', source));

  assert.ok(ids.includes('javascript.implicit-arrow-return'));
  assert.ok(ids.includes('javascript.redundant-return-variable'));
  assert.ok(ids.includes('javascript.terminal-semicolon'));
});

test('cpp analyzer identifies namespace, newline, and implicit main return candidates', () => {
  const registry = createDefaultCompressionAnalyzerRegistry();
  const source =
    'int main(){std::cout<<std::string(\"x\")<<std::endl;' +
    'std::cout<<std::string(\"y\");std::cout<<std::string(\"z\");return 0;}';
  const ids = suggestionIds(registry.analyze('cpp', source));

  assert.ok(ids.includes('cpp.standard-namespace'));
  assert.ok(ids.includes('cpp.endl'));
  assert.ok(ids.includes('cpp.main-return-zero'));
});

test('java analyzer identifies shorter string construction and repeated output', () => {
  const registry = createDefaultCompressionAnalyzerRegistry();
  const source = [
    'class Main{public static void main(String[]a){',
    'System.out.println(new String("a"));',
    'System.out.println("b");',
    'System.out.println("c");',
    'System.out.println("d");',
    'System.out.println("e");',
    '}}'
  ].join('\n');
  const ids = suggestionIds(registry.analyze('java', source));

  assert.ok(ids.includes('java.static-out'));
  assert.ok(ids.includes('java.redundant-string-constructor'));
});

test('registry accepts custom analyzers and rejects accidental replacement', () => {
  const registry = createCompressionAnalyzerRegistry();
  const analyzer = {
    language: 'ruby',
    analyze(source) {
      return {
        language: 'ruby',
        sourceLength: source.length,
        estimatedSavings: 0,
        estimatedLength: source.length,
        suggestions: []
      };
    }
  };

  registry.register(analyzer);
  assert.equal(registry.has('ruby'), true);
  assert.equal(registry.analyze('ruby', 'puts 1').language, 'ruby');
  assert.throws(() => registry.register(analyzer), /already registered/);
  assert.equal(registry.unregister('ruby'), true);
  assert.throws(() => registry.analyze('ruby', ''), /no compression analyzer/);
});

test('analyzers reject oversized source before regular-expression scanning', () => {
  const registry = createDefaultCompressionAnalyzerRegistry();

  assert.throws(
    () => registry.analyze('python', 'x'.repeat(MAX_SOURCE_LENGTH + 1)),
    /must not exceed/
  );
});
