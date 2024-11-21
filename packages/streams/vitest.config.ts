import { defineProject, mergeConfig } from 'vitest/config';

import defaultConfig from '../../vitest.config.js';

delete defaultConfig.test?.environment;

const config = mergeConfig(
  defaultConfig,
  defineProject({
    test: {
      name: 'streams',
      setupFiles: '../shims/src/endoify.js',
      pool: 'forks',
      browser: {
        provider: 'playwright',
        name: 'chromium',
        enabled: true,
        headless: true,
        screenshotFailures: false,
      },
    },
  }),
);

config.test.coverage.thresholds = true;

export default config;
