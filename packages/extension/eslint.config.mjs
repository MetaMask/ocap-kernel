import baseConfig from '../../eslint.config.mjs';

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
