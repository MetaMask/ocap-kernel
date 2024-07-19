module.exports = {
  extends: ['../../.eslintrc.js'],

  ignorePatterns: ['**/shims/*.mjs'],

  // overrides: [
  //   {
  //     files: ['src/**/*.js'],
  //     globals: { chrome: 'readonly', clients: 'readonly' },
  //   },

  //   {
  //     files: ['vite.config.mts'],
  //     parserOptions: {
  //       sourceType: 'module',
  //       tsconfigRootDir: __dirname,
  //       project: ['./tsconfig.scripts.json'],
  //     },
  //   },
  // ],
};
