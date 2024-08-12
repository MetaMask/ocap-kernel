module.exports = {
  extends: ['../../.eslintrc.js'],

  ignorePatterns: ['src/eventual-send.mjs'],

  overrides: [
    {
      files: ['src/**/*.mjs'],
      globals: { lockdown: 'readonly' },
      rules: {
        'import/extensions': 'off',
        'import/no-unassigned-import': 'off',
        'import/no-unresolved': 'off',
      },
    },
  ],
};
