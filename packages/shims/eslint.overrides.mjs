// @ts-check

/** @type {import('eslint').Linter.Config[]} */
const config = [
  {
    languageOptions: {
      globals: { lockdown: 'readonly' },
    },
  },
];

export default config;
