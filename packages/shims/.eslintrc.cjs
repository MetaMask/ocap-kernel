module.exports = {
  extends: ['../../.eslintrc.cjs'],

  ignorePatterns: ['src/eventual-send.mjs'],

  overrides: [
    {
      files: ['src/**/*.mjs'],
      globals: { lockdown: 'readonly' },
      rules: {
        'import-x/extensions': 'off',
        'import-x/no-unassigned-import': 'off',
        'import-x/no-unresolved': 'off',
      },
    },
  ],
};
