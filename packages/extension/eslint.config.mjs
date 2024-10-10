// @ts-check

import baseConfig from '../../eslint.config.mjs';

/** @type {import('eslint').Linter.Config[]} */
const config = [
  ...baseConfig,
  {
    files: ['vite.config.ts'],
    languageOptions: {
      parserOptions: {
        sourceType: 'module',
        project: ['./tsconfig.scripts.json'],
      },
    },
  },
];

export default config;
