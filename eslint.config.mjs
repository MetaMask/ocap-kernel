// @ts-check

import metamaskConfig, { createConfig } from '@metamask/eslint-config';
import metamaskNodeConfig from '@metamask/eslint-config-nodejs';
import metamaskTypescriptConfig from '@metamask/eslint-config-typescript';
import metamaskVitestConfig from '@metamask/eslint-config-vitest';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const config = createConfig([
  {
    extends: [metamaskConfig, metamaskNodeConfig],
  },

  {
    ignores: [
      '**/coverage',
      '**/dist',
      '**/docs',
      '**/node_modules',
      '**/packages/create-package/src/package-template',
    ],
  },

  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      sourceType: 'module',
    },
    rules: {
      'import-x/no-unresolved': ['error', { commonjs: false }],
    },
  },

  {
    files: ['**/*.cjs'],
    languageOptions: {
      sourceType: 'script',
    },
  },

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: dirname(fileURLToPath(import.meta.url)),
      },
    },
  },

  {
    files: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts', '**/*.d.ts'],
    extends: [metamaskTypescriptConfig],
    rules: {
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        {
          // To permit omitting the return type in situations like:
          // `const obj = { foo: (bar: string) => bar };`
          // We'll presume that `obj` has a type that enforces the return type.
          allowExpressions: true,
        },
      ],
      '@typescript-eslint/no-explicit-any': 'error',

      // Replace this tseslint rule with "verbatimModuleSyntax" tsconfig
      // option and "import-x/consistent-type-specifiers" rule.
      '@typescript-eslint/consistent-type-imports': 'off',
      'import-x/consistent-type-specifier-style': ['error', 'prefer-top-level'],

      // This should only be enabled for JavaScript files.
      // Ref: https://github.com/import-js/eslint-plugin-import/issues/2215#issuecomment-911245486
      'import-x/unambiguous': 'off',

      // Permit the use of .finally() after .catch().
      // https://github.com/eslint-community/eslint-plugin-promise/blob/main/docs/rules/catch-or-return.md#allowfinally
      'promise/catch-or-return': ['error', { allowFinally: true }],

      // https://eslint.org/docs/latest/rules/no-unused-expressions#options
      '@typescript-eslint/no-unused-expressions': [
        'error',
        {
          allowShortCircuit: true,
          allowTaggedTemplates: true,
          allowTernary: true,
        },
      ],

      // Nag if console statements are used in TypeScript files
      'no-console': 'warn',
    },
  },

  {
    files: [
      '**/kernel-errors/**/*.ts',
      '**/kernel-store/**/*.ts',
      '**/kernel-rpc-methods/**/*.ts',
      '**/kernel-utils/**/*.ts',
      '**/ocap-kernel/**/*.ts',
    ],
    rules: {
      // Prevent console statements in TypeScript files
      // Use the logger instead
      'no-console': 'error',
    },
  },

  {
    files: ['**/*.test.ts'],
    rules: {
      'no-console': 'off',
    },
  },

  {
    files: ['*.tsx', '**/ui/**/*.ts'],
    plugins: { react, 'react-hooks': reactHooks },
    rules: {
      ...react.configs.flat?.['jsx-runtime']?.rules,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
    languageOptions: {
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
        jsxPragma: null,
        sourceType: 'module',
        project: ['./packages/*/tsconfig.lint.json'],
      },
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
  },

  {
    files: ['**/*.test.ts', '**/*.test.tsx'],
    extends: [metamaskVitestConfig],
    rules: {
      // This causes false positives in tests especially.
      '@typescript-eslint/unbound-method': 'off',
      // We should enable this instead, but the rule is unreleased.
      // See https://github.com/vitest-dev/eslint-plugin-vitest/issues/359
      // 'vitest/unbound-method': 'error',
    },
  },

  {
    files: ['**/test/**/*', '**/*.test.ts', '**/*.test.tsx'],
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off',
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

  {
    files: ['**/scripts/**/*'],
    rules: {
      // Script files have reasonable cause to interact with process
      'n/no-process-env': 'off',
      'n/no-process-exit': 'off',
    },
  },

  {
    languageOptions: {
      globals: {
        ...globals['shared-node-browser'],
      },
    },
    rules: {
      // We use the actual source file extensions and let tsc rewrite them.
      'import-x/extensions': ['error', 'ignorePackages'],

      // We have been hoisted by our own petard in the past.
      'import-x/no-cycle': ['error', { ignoreExternal: true, maxDepth: 3 }],

      // We use unassigned imports for e.g. `import '@metamask/kernel-shims/endoify'`.
      'import-x/no-unassigned-import': 'off',

      'import-x/no-useless-path-segments': [
        'error',
        {
          // Enabling this causes false errors in ESM files.
          noUselessIndex: false,
        },
      ],

      // This prevents pretty formatting of comments with multi-line lists entries.
      'jsdoc/check-indentation': 'off',

      // This prevents using Node.js and/or browser specific globals. We
      // currently use both in our codebase, so this rule is disabled.
      'no-restricted-globals': 'off',

      // The fetch builtin has been supported since node 18.
      'n/no-unsupported-features/node-builtins': [
        'error',
        {
          ignores: ['fetch'],
        },
      ],

      // e.g. (0 < x && x < 47) is OK.
      yoda: ['error', 'never', { exceptRange: true }],
    },
  },

  {
    files: ['packages/kernel-shims/**/*'],
    languageOptions: {
      globals: { lockdown: 'readonly' },
    },
  },

  {
    files: [
      '**/vitest.config.ts',
      'packages/nodejs/**/*-worker.ts',
      'packages/nodejs/test/workers/**/*',
    ],
    rules: {
      'n/no-process-env': 'off',
    },
  },

  {
    files: [
      'packages/nodejs/test/workers/**/*',
      'packages/logger/test/workers/**/*',
    ],
    rules: {
      // Test worker files can resolve these imports, even if eslint cannot.
      'import-x/no-unresolved': 'off',
    },
  },

  {
    files: ['packages/demo/demos/**/*.js'],
    rules: {
      // Demo files: doc less, say more.
      'jsdoc/require-jsdoc': 'off',
    },
  },
]);

export default config;
