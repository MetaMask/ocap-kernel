import path from 'path';
import { defineProject, mergeConfig } from 'vitest/config';

import defaultConfig from '../../vitest.config.js';

delete defaultConfig.test?.environment;

const config = mergeConfig(
  defaultConfig,
  defineProject({
    test: {
      name: 'streams',
      setupFiles: path.resolve(__dirname, '../shims/src/endoify.js'),
      browser: {
        enabled: true,
        provider: 'playwright',
        instances: [
          {
            browser: 'chromium',
            headless: true,
            screenshotFailures: false,
          },
        ],
      },
    },
  }),
);

config.test.coverage.thresholds = true;

export default config;
