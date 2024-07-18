module.exports = {
  extends: ['../../.eslintrc.js'],

  overrides: [
    {
      files: ['src/extension/**/*.js'],
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
      files: ['vite.*.mts'],
      parserOptions: {
        sourceType: 'module',
        tsconfigRootDir: __dirname,
      },
    },
  ],
};
