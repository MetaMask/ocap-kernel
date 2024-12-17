// @ts-check

import metamaskConfig, { createConfig } from '@metamask/eslint-config';
import metamaskNodeConfig from '@metamask/eslint-config-nodejs';
import metamaskTypescriptConfig from '@metamask/eslint-config-typescript';
import metamaskVitestConfig from '@metamask/eslint-config-vitest';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

const config = createConfig([
  {
    extends: [metamaskConfig, metamaskNodeConfig],
  },

  {
    ignores: ['node_modules', '**/dist', '**/docs', '**/coverage'],
  },

  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      sourceType: 'module',
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
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  {
    files: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'],
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
      // React rules
      ...react.configs.flat?.['jsx-runtime']?.rules,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
    // @ts-expect-error - The createConfig types are wrong
    plugins: { react, 'react-hooks': reactHooks },
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
      // Script files have reasonable cause to read from process.env
      'n/no-process-env': 'off',
    },
  },

  {
    languageOptions: {
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

      // We have been hoisted by our own petard in the past.
      'import-x/no-cycle': ['error', { ignoreExternal: true, maxDepth: 3 }],

      // This is not compatible with ESM.
      'import-x/extensions': 'off',

      // We use unassigned imports for e.g. `import '@ocap/shims/endoify'`.
      'import-x/no-unassigned-import': 'off',

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
    },
  },

  // ////////////////////////// //
  // Package-specific overrides //
  // ////////////////////////// //

  {
    files: ['packages/shims/**/*'],
    languageOptions: {
      globals: { lockdown: 'readonly' },
    },
  },
]);

export default config;
