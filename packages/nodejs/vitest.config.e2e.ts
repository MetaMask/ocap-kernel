import { defineConfig, mergeConfig } from 'vite';

import defaultConfig from '../../vitest.config.js';

export default mergeConfig(
  defaultConfig,
  defineConfig({
    test: {
      name: 'nodejs:e2e',
      pool: 'forks',
      include: ['./test/e2e/**/*.test.ts'],
      exclude: ['./src/**/*'],
    },
  }),
);
