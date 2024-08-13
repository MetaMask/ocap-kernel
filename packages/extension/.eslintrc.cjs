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
      files: ['vite.config.ts'],
      parserOptions: {
        sourceType: 'module',
        tsconfigRootDir: __dirname,
        project: ['./tsconfig.scripts.json'],
      },
    },
  ],
};
