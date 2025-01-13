import { defineProject, mergeConfig } from 'vitest/config';

import defaultConfig from '../../vitest.config.js';

const config = mergeConfig(
  defaultConfig,
  defineProject({
    build: {
      ssr: true,
      rollupOptions: {
        output: {
          esModule: true,
        },
      },
    },
    test: {
      name: 'cli',
      exclude: ['**/test/integration/**'],
    },
  }),
);

config.test.coverage.thresholds = true;

export default config;
