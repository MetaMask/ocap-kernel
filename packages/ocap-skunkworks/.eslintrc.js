module.exports = {
  extends: ['../../.eslintrc.js'],

  overrides: [
    {
      files: ['src/extension/**/*.js'],
      globals: { chrome: 'readonly', clients: 'readonly' },
    },

    {
      files: ['vite.*.mts'],
      parserOptions: {
        sourceType: 'module',
        tsconfigRootDir: __dirname,
      },
    },
  ],
};
