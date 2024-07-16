module.exports = {
  extends: ['../../.eslintrc.js'],

  overrides: [
    {
      files: ['src/extension/**/*.js'],
      globals: { chrome: 'readonly', clients: 'readonly' },
      rules: {
        'jsdoc/require-jsdoc': 'off',
      },
    },
  ],
};
