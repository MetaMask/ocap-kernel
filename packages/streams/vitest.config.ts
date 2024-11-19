import { defineProject, mergeConfig } from 'vitest/config';

import defaultConfig from '../../vitest.config.js';

delete defaultConfig.test?.environment;

export default mergeConfig(
  defaultConfig,
  defineProject({
    test: {
      name: 'streams',
      setupFiles: '../shims/src/endoify.js',
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
