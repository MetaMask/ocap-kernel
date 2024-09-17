module.exports = {
  extends: ['../../.eslintrc.cjs'],

  ignorePatterns: ['types.d.ts'],

  overrides: [
    {
      files: ['src/**/*.ts'],
      globals: {
        chrome: 'readonly',
        clients: 'readonly',
        Compartment: 'readonly',
      },
    },

    {
      files: ['vite.config.ts'],
      parserOptions: {
        sourceType: 'module',
        tsconfigRootDir: __dirname,
        project: ['./tsconfig.scripts.json'],
      },
    },

    {
      files: ['src/**/*-trusted-prelude.js'],
      rules: {
        'import-x/extensions': 'off',
        'import-x/no-unassigned-import': 'off',
        'import-x/no-unresolved': 'off',
      },
    },
  ],
};
