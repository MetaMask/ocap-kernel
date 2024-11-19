import { defineProject, mergeConfig } from 'vitest/config';

import defaultConfig from '../../vitest.config.js';

const config = mergeConfig(
  defaultConfig,
  defineProject({
    test: {
      name: 'utils',
      setupFiles: '../test-utils/src/env/mock-endo.ts',
    },
  }),
);

config.test.coverage.thresholds = true;

export default config;
