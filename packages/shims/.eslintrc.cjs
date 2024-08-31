module.exports = {
  extends: ['../../.eslintrc.cjs'],

  ignorePatterns: ['src/eventual-send.mjs'],

  overrides: [
    {
      files: ['src/**/*.js', 'scripts/**/*.js'],
      globals: { lockdown: 'readonly' },
      rules: {
        'import-x/extensions': 'off',
        'import-x/no-unassigned-import': 'off',
        'import-x/no-unresolved': 'off',
      },
    },
  ],
};
