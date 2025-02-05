import { defineConfig, defineProject, mergeConfig } from 'vitest/config';

import defaultConfig from '../../vitest.config.js';

export default defineConfig(({ mode }) => {
  delete defaultConfig.test?.environment;

  const config = mergeConfig(
    defaultConfig,
    defineProject({
      test: {
        name: 'streams',
        ...(mode === 'development'
          ? {
              environment: 'jsdom',
              setupFiles: ['../test-utils/src/env/mock-endoify.ts'],
            }
          : {
              setupFiles: '../shims/src/endoify.js',
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
            }),
      },
    }),
  );

  if (mode === 'development') {
    delete config.test.coverage;
  } else {
    config.test.coverage.thresholds = {};
  }

  return config;
});
