import { describe, it, expect } from 'vitest';

import { replaceNodeEnvPlugin } from './replace-node-env-plugin.ts';

type TransformFn = (
  code: string,
  id: string,
) => { code: string; map: null } | null;

describe('replaceNodeEnvPlugin', () => {
  const plugin = replaceNodeEnvPlugin();
  const transform = plugin.transform as TransformFn;

  it.each([
    ['bare reference', `process.env.NODE_ENV`, `"production"`],
    [
      'reference in a conditional',
      `if (process.env.NODE_ENV !== 'production') { warn(); }`,
      `if ("production" !== 'production') { warn(); }`,
    ],
    [
      'multiple references in one file',
      `const a = process.env.NODE_ENV;\nconst b = process.env.NODE_ENV;`,
      `const a = "production";\nconst b = "production";`,
    ],
    [
      'reference surrounded by other code',
      `const x = 1;\nexport const mode = process.env.NODE_ENV;\nconst y = 2;`,
      `const x = 1;\nexport const mode = "production";\nconst y = 2;`,
    ],
  ])(
    'replaces %s with the "production" string literal',
    (_name, code, expected) => {
      const result = transform(code, 'test.ts');
      expect(result).toStrictEqual({ code: expected, map: null });
    },
  );

  it('injects a quoted string literal, not the bare word', () => {
    const result = transform(`const mode = process.env.NODE_ENV;`, 'test.ts');
    expect(result?.code).toContain(`"production"`);
    expect(result?.code).not.toContain(`process.env.NODE_ENV`);
    expect(result?.code).not.toContain(`= production;`);
  });

  it.each([
    ['no process reference', 'const x = 1;'],
    ['unrelated process.env key', `const port = process.env.PORT;`],
    ['empty code', ''],
  ])('returns null for %s', (_name, code) => {
    expect(transform(code, 'test.ts')).toBeNull();
  });

  it('returns null when the substring matches but the word boundary does not', () => {
    const code = `const x = process.env.NODE_ENVIRONMENT;`;
    expect(transform(code, 'test.ts')).toBeNull();
  });

  it('inlines a configured value instead of the default', () => {
    const devTransform = replaceNodeEnvPlugin({ value: 'development' })
      .transform as TransformFn;
    const result = devTransform(
      `const mode = process.env.NODE_ENV;`,
      'test.ts',
    );
    expect(result).toStrictEqual({
      code: `const mode = "development";`,
      map: null,
    });
  });
});
