// @ts-check

import metamaskConfig from '@metamask/eslint-config';
import metamaskNodeConfig from '@metamask/eslint-config-nodejs';
import metamaskTypescriptConfig from '@metamask/eslint-config-typescript';
import vitest from '@vitest/eslint-plugin';
import globals from 'globals';

/** @type {import('eslint').Linter.Config[]} */
const config = [
  ...metamaskConfig,
  ...metamaskNodeConfig,
  ...metamaskTypescriptConfig.map((options) => ({
    ...options,
    files: ['**/*.{ts,mts,cts}'],
  })),
  {
    ignores: [
      'yarn.config.cjs',
      '**/vite.config.ts',
      '**/vitest.config.ts',
      'node_modules',
      '**/dist',
      '**/docs',
      '**/coverage',
    ],
  },
  {
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: new URL('.', import.meta.url).pathname,
      },
      globals: {
        ...globals['shared-node-browser'],
      },
    },
    rules: {
      'import-x/no-useless-path-segments': [
        'error',
        {
          // Enabling this causes false errors in ESM files.
          noUselessIndex: false,
        },
      ],

      // This prevents using Node.js and/or browser specific globals. We
      // currently use both in our codebase, so this rule is disabled.
      'no-restricted-globals': 'off',

      'import-x/extensions': 'off',
      'import-x/no-unassigned-import': 'off',

      // This prevents pretty formatting of comments with multi-line lists entries.
      'jsdoc/check-indentation': 'off',
    },
  },

  {
    files: ['**/*.{ts,mts,cts}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        {
          // To permit omitting the return type in situations like:
          // `const obj = { foo: (bar: string) => bar };`
          // We'll presume that `obj` has a type that enforces the return type.
          allowExpressions: true,
        },
      ],
    },
  },

  {
    files: ['**/*.test.{ts,js}'],
    plugins: { vitest },
    rules: {
      ...vitest.configs.recommended.rules,
      'vitest/no-alias-methods': 'error',
      'vitest/prefer-to-be': 'error',
      'vitest/prefer-to-contain': 'error',
      'vitest/prefer-to-have-length': 'error',
      'vitest/consistent-test-it': ['error', { fn: 'it' }],
      'vitest/no-conditional-in-test': 'error',
      'vitest/no-duplicate-hooks': 'error',
      'vitest/no-test-return-statement': 'error',
      'vitest/prefer-hooks-on-top': 'error',
      'vitest/prefer-lowercase-title': ['error', { ignore: ['describe'] }],
      'vitest/prefer-spy-on': 'error',
      'vitest/prefer-strict-equal': 'error',
      'vitest/prefer-todo': 'error',
      'vitest/require-top-level-describe': 'error',
      'vitest/require-to-throw-message': 'error',
      'vitest/valid-expect': ['error', { alwaysAwait: true }],
      'vitest/no-restricted-matchers': [
        'error',
        {
          resolves: 'Use `expect(await promise)` instead.',
          toBeFalsy: 'Avoid `toBeFalsy`',
          toBeTruthy: 'Avoid `toBeTruthy`',
          toMatchSnapshot: 'Use `toMatchInlineSnapshot()` instead',
          toThrowErrorMatchingSnapshot:
            'Use `toThrowErrorMatchingInlineSnapshot()` instead',
        },
      ],
    },
  },

  {
    files: ['**/*.types.test.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      'vitest/expect-expect': 'off',
      'vitest/no-conditional-in-test': 'off',
    },
  },
];

export default config;
