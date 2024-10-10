// @ts-check

import metamaskConfig from '@metamask/eslint-config';
import metamaskNodeConfig from '@metamask/eslint-config-nodejs';
import metamaskTypescriptConfig from '@metamask/eslint-config-typescript';
import metamaskVitestConfig from '@metamask/eslint-config-vitest';
import globals from 'globals';

/** @type {import('eslint').Linter.Config[]} */
const config = [
  ...metamaskConfig,
  ...metamaskNodeConfig,
  ...metamaskTypescriptConfig.map((options) => ({
    ...options,
    files: ['**/*.{ts,mts,cts}'],
  })),
  ...metamaskVitestConfig.map((options) => ({
    ...options,
    files: ['**/*.test.{ts,js}'],
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

      'import-x/extensions': 'off',
      'import-x/no-unassigned-import': 'off',

      // This prevents pretty formatting of comments with multi-line lists entries.
      'jsdoc/check-indentation': 'off',

      // This prevents using Node.js and/or browser specific globals. We
      // currently use both in our codebase, so this rule is disabled.
      'no-restricted-globals': 'off',
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
