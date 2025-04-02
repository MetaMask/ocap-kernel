import { defineProject, mergeConfig } from 'vitest/config';

import defaultConfig from '../../vitest.config.ts';

const config = mergeConfig(
  defaultConfig,
  defineProject({
    test: {
      name: 'kernel-test',
      pool: 'forks',
      exclude: ['./src/utils.ts'],
    },
  }),
);

config.test.coverage.thresholds = true;

export default config;
