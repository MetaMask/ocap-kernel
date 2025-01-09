import { defineProject, mergeConfig } from 'vitest/config';

import defaultConfig from '../../vitest.config.js';

const config = mergeConfig(
  defaultConfig,
  defineProject({
    test: {
      name: 'errors',
      setupFiles: '../shims/src/endoify.js',
    },
  }),
);

config.test.coverage.thresholds = true;

export default config;
