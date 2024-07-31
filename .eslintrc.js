module.exports = {
  root: true,

  extends: ['@metamask/eslint-config', '@metamask/eslint-config-nodejs'],

  parserOptions: {
    tsconfigRootDir: __dirname,
  },

  env: {
    'shared-node-browser': true,
  },

  ignorePatterns: [
    '!.eslintrc.js',
    '!vite.config.mts',
    '!vitest.config.mts',
    'node_modules',
    '**/dist',
    '**/docs',
    '**/coverage',
  ],

  rules: {
    // This prevents importing Node.js builtins. We currently use them in
    // our codebase, so this rule is disabled. This rule should be disabled
    // in `@metamask/eslint-config-nodejs` in the future.
    'import/no-nodejs-modules': 'off',

    // This prevents using Node.js and/or browser specific globals. We
    // currently use both in our codebase, so this rule is disabled.
    'no-restricted-globals': 'off',
  },

  overrides: [
    {
      files: ['*.js', '*.cjs'],
      parserOptions: {
        sourceType: 'script',
        ecmaVersion: '2020',
      },
    },

    {
      files: ['*.mjs'],
      parserOptions: {
        sourceType: 'module',
        ecmaVersion: '2020',
      },
    },

    {
      files: ['**/scripts/*.mjs', '*.mts'],
      parserOptions: {
        ecmaVersion: '2022',
      },
      rules: {
        'import/extensions': 'off',
        'import/no-unassigned-import': 'off',
      },
    },

    {
      files: ['*.ts', '*.cts', '*.mts'],
      extends: ['@metamask/eslint-config-typescript'],
      parserOptions: {
        tsconfigRootDir: __dirname,
        project: ['./tsconfig.packages.json'],
      },
      rules: {
        '@typescript-eslint/no-explicit-any': 'error',

        // This rule is broken, and without the `allowAny` option, it causes
        // a lot of false positives.
        '@typescript-eslint/restrict-template-expressions': [
          'error',
          {
            allowAny: true,
            allowBoolean: true,
            allowNumber: true,
          },
        ],
      },
    },

    {
      files: ['*.d.ts'],
      rules: {
        'import/unambiguous': 'off',
      },
    },

    {
      files: ['scripts/*.ts'],
      rules: {
        // All scripts will have shebangs.
        'n/shebang': 'off',
      },
    },

    {
      files: ['**/*.test.{ts,js}'],
      plugins: ['vitest'],
      extends: ['plugin:vitest/recommended'],
    },
  ],
};
