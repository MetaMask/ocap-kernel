module.exports = {
  extends: ['../../.eslintrc.js'],

  overrides: [
    {
      files: ['apply-lockdown.mjs'],
      globals: { lockdown: 'readonly' },
      rules: {
        'import/extensions': 'off',
        'import/no-unassigned-import': 'off',
        'import/no-unresolved': 'off',
        'import/unambiguous': 'off',
      },
    },
  ],
};
