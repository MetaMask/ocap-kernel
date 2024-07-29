module.exports = {
  extends: ['../../.eslintrc.cjs'],

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
      files: ['vite.config.mts'],
      parserOptions: {
        sourceType: 'module',
        tsconfigRootDir: __dirname,
        project: ['./tsconfig.scripts.json'],
      },
    },

    {
      files: ['test/setup.mjs'],
      rules: {
        'import/extensions': 'off',
        'import/no-unassigned-import': 'off',
        'import/no-unresolved': 'off',
      },
    },
  ],
};
