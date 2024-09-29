module.exports = {
  extends: ['../../.eslintrc.cjs'],

  overrides: [
    {
      files: ['src/BaseStream.ts', 'src/MessagePortStream.ts'],
      rules: {
        // This naive, Node-specific rule does not apply to these files.
        'n/no-sync': 'off',
      },
    },
  ],
};
