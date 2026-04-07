import { describe, it, expect, vi } from 'vitest';

import { removeDynamicImportsPlugin } from './bundle-vat.ts';

type TransformFn = (
  code: string,
  id: string,
) => { code: string; map: null } | null;

describe('removeDynamicImportsPlugin', () => {
  const plugin = removeDynamicImportsPlugin();
  const transform = (plugin.transform as TransformFn).bind({
    warn: vi.fn(),
  });

  it.each([
    ['single-quoted import', `import('module')`, `Promise.resolve({})`],
    ['double-quoted import', `import("module")`, `Promise.resolve({})`],
    ['backtick-quoted import', 'import(`module`)', `Promise.resolve({})`],
    [
      'import with whitespace before paren',
      `import ('module')`,
      `Promise.resolve({})`,
    ],
    [
      'import with whitespace around specifier',
      `import(  'module'  )`,
      `Promise.resolve({})`,
    ],
    [
      'multiple dynamic imports in one file',
      `const a = import('foo');\nconst b = import("bar");`,
      `const a = Promise.resolve({});\nconst b = Promise.resolve({});`,
    ],
    [
      'dynamic import surrounded by other code',
      `const x = 1;\nawait import('lazy-util');\nconst y = 2;`,
      `const x = 1;\nawait Promise.resolve({});\nconst y = 2;`,
    ],
  ])('replaces %s', (_name, code, expected) => {
    const result = transform(code, 'test.ts');
    expect(result).toStrictEqual({ code: expected, map: null });
  });

  it.each([
    ['no import at all', 'const x = 1;'],
    ['ESM import statement', `import foo from 'bar';`],
    ['ESM named import', `import { foo } from 'bar';`],
    ['empty code', ''],
  ])('returns null for %s (fast-path miss)', (_name, code) => {
    expect(transform(code, 'test.ts')).toBeNull();
  });

  it.each([
    ['computed specifier (variable)', `import(variable)`],
    ['computed specifier (expression)', `import(getPath())`],
    ['computed specifier (concatenation)', `import('./locales/' + lang)`],
  ])('returns null for %s (no literal match)', (_name, code) => {
    expect(transform(code, 'test.ts')).toBeNull();
  });

  it('does not match reimport or similar substrings', () => {
    const code = `reimport('foo')`;
    expect(transform(code, 'test.ts')).toBeNull();
  });

  it('warns when fast-path matches but replacement regex does not', () => {
    const warn = vi.fn();
    const boundTransform = (plugin.transform as TransformFn).bind({
      warn,
    });

    boundTransform(`import(variable)`, 'test.ts');

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('could not be replaced'),
    );
  });
});
