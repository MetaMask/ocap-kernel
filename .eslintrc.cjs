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
    '!.eslintrc.cjs',
    '!vite.config.ts',
    '!vitest.config.ts',
    'node_modules',
    '**/dist',
    '**/docs',
    '**/coverage',
  ],

  rules: {
    // This prevents importing Node.js builtins. We currently use them in
    // our codebase, so this rule is disabled. This rule should be disabled
    // in `@metamask/eslint-config-nodejs` in the future.
    'import-x/no-nodejs-modules': 'off',

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
  },

  overrides: [
    {
      files: ['*.cjs'],
      parserOptions: {
        sourceType: 'script',
        ecmaVersion: '2020',
      },
    },

    {
      files: ['*.js', '*.mjs'],
      parserOptions: {
        sourceType: 'module',
        ecmaVersion: '2020',
      },
    },

    {
      files: ['**/scripts/*.+(js|mjs)', '*.ts'],
      parserOptions: {
        ecmaVersion: '2022',
      },
      rules: {
        'import-x/extensions': 'off',
        'import-x/no-unassigned-import': 'off',
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

        // This rule is broken, and without the `allowAny` option, it reports a lot
        // of false errors.
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
        'import-x/unambiguous': 'off',
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
      // Overrides of overrides.
      files: ['*'],
      rules: {
        // This prevents pretty formatting of comments with multi-line lists entries.
        'jsdoc/check-indentation': 'off',
      },
    },

    {
      // @metamask/eslint-plugin-vitest does not exist, so this is copied from the
      // jest-equivalent. All of the rules we specify are the same. Ref:
      // https://github.com/MetaMask/eslint-config/blob/95275db568999bf48670894a3dc6b6c1a2f517f9/packages/jest/src/index.js
      files: ['**/*.test.{ts,js}'],
      plugins: ['vitest'],
      extends: ['plugin:vitest/recommended'],
      rules: {
        // From the jest/style ruleset (no corresponding ruleset for vitest). Ref:
        // https://github.com/jest-community/eslint-plugin-jest/blob/39719a323466aada48531fe28ec953e17dee6e65/src/index.ts#L74-L77
        'vitest/no-alias-methods': 'error', // We upgrade this to an error
        'vitest/prefer-to-be': 'error',
        'vitest/prefer-to-contain': 'error',
        'vitest/prefer-to-have-length': 'error',
        // From MetaMask's custom ruleset
        'vitest/consistent-test-it': ['error', { fn: 'it' }],
        'vitest/no-conditional-in-test': 'error', // Previously "jest/no-if"
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
  ],
};
