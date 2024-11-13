import { defineProject, mergeConfig } from 'vitest/config';

import defaultConfig from '../../vitest.config.js';

const config = mergeConfig(
  defaultConfig,
  defineProject({
    test: {
      pool: 'vmThreads',
    },
  }),
);

delete config.test.coverage.thresholds;
export default config;
