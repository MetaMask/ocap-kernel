import { defineProject, mergeConfig } from 'vitest/config';

import defaultConfig from '../../vitest.config.js';

const config = mergeConfig(
  defaultConfig,
  defineProject({
    test: {
      name: 'kernel-test',
      pool: 'forks',
    },
  }),
);

config.test.coverage.thresholds = true;

export default config;
