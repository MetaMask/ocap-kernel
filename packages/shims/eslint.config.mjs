import baseConfig from '../../eslint.config.mjs';

const config = [
  ...baseConfig,
  {
    languageOptions: {
      globals: { lockdown: 'readonly' },
    },
  },
];

export default config;
