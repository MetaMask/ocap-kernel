module.exports = {
  extends: ['../../.eslintrc.js'],

  overrides: [
    {
      files: ['src/**/*.js'],
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
  ],
};
