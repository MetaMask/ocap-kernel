import { describe, it, expect } from 'vitest';

import { stripCommentsPlugin } from './strip-comments-plugin.ts';

describe('stripCommentsPlugin', () => {
  describe('parsing non-strict-mode code', () => {
    const plugin = stripCommentsPlugin();
    const renderChunk = plugin.renderChunk as (code: string) => string | null;

    it('handles octal literals in bundled IIFE code', () => {
      // Octal literals like 010 are valid in non-strict mode (scripts)
      // but invalid in strict mode (modules). IIFE bundles are scripts.
      const iifeWithOctal = '(function() { var x = 010; /* comment */ })();';
      expect(() => renderChunk(iifeWithOctal)).not.toThrow();
    });

    it('handles with statements in bundled IIFE code', () => {
      // 'with' statements are valid in non-strict mode (scripts)
      // but invalid in strict mode (modules). IIFE bundles are scripts.
      const iifeWithWith = '(function() { with(obj) { /* comment */ x; } })();';
      expect(() => renderChunk(iifeWithWith)).not.toThrow();
    });
  });
  const plugin = stripCommentsPlugin();
  const renderChunk = plugin.renderChunk as (code: string) => string | null;

  it.each([
    [
      'single-line comment',
      'const x = 1; // comment\nconst y = 2;',
      'const x = 1; \nconst y = 2;',
    ],
    [
      'multi-line comment',
      'const x = 1; /* comment */ const y = 2;',
      'const x = 1;  const y = 2;',
    ],
    [
      'multiple comments',
      '/* a */ const x = 1; // b\n/* c */',
      ' const x = 1; \n',
    ],
    [
      'comment containing import()',
      'const x = 1; // import("module")\nconst y = 2;',
      'const x = 1; \nconst y = 2;',
    ],
    [
      'comment with string content preserved',
      'const x = "// in string"; // real comment',
      'const x = "// in string"; ',
    ],
    ['code that is only a comment', '// just a comment', ''],
  ])('removes %s', (_name, code, expected) => {
    expect(renderChunk(code)).toBe(expected);
  });

  it.each([
    ['string with // pattern', 'const x = "// not a comment";'],
    ['string with /* */ pattern', 'const x = "/* not a comment */";'],
    ['regex literal like //', 'const re = /\\/\\//;'],
    ['template literal with // pattern', 'const x = `// not a comment`;'],
    ['nested quotes in string', 'const x = "a \\"// not comment\\" b";'],
    ['no comments', 'const x = 1;'],
    ['empty code', ''],
  ])('returns null for %s', (_name, code) => {
    expect(renderChunk(code)).toBeNull();
  });
});
