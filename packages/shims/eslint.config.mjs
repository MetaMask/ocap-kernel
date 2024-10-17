// @ts-check

import overridesConfig from './eslint.overrides.mjs';
import baseConfig from '../../eslint.config.mjs';

/** @type {import('eslint').Linter.Config[]} */
const config = [
  ...baseConfig,
  ...overridesConfig,
  {
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: new URL('.', import.meta.url).pathname,
      },
    },
  },
];

export default config;
