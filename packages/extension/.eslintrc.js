module.exports = {
  extends: ['../../.eslintrc.js'],

  overrides: [
    {
      files: ['src/**/*.js'],
      globals: { chrome: 'readonly', clients: 'readonly' },
    },

    {
      files: ['apply-lockdown.mjs'],
      globals: { lockdown: 'readonly' },
      rules: {
        'import/unambiguous': 'off',
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
