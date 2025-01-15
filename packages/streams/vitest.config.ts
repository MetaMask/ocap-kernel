import { defineProject, mergeConfig } from 'vitest/config';

import defaultConfig from '../../vitest.config.js';

delete defaultConfig.test?.environment;

const config = mergeConfig(
  defaultConfig,
  defineProject({
    test: {
      name: 'streams',
      environment: 'jsdom',
    },
  }),
);

config.test.coverage.thresholds = true;

export default config;
