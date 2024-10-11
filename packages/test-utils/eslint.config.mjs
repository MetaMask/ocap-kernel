// @ts-check

import baseConfig from '../../eslint.config.mjs';

/** @type {import('eslint').Linter.Config[]} */
const config = [
  ...baseConfig,
  {
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: new URL('.', import.meta.url).pathname,
      },
    },
  },
];

export default config;
