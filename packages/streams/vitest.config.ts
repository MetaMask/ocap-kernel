// eslint-disable-next-line spaced-comment
/// <reference types="vitest" />

import { defineConfig, mergeConfig } from 'vite';

import { getDefaultConfig } from '../../vitest.config.packages.js';

const defaultConfig = getDefaultConfig();
delete defaultConfig.test?.environment;

export default mergeConfig(
  defaultConfig,
  defineConfig({
    optimizeDeps: {
      include: ['@vitest/coverage-istanbul'],
    },
    test: {
      setupFiles: '../shims/src/endoify.js',
      browser: {
        provider: 'playwright',
        name: 'chromium',
        enabled: true,
        headless: true,
        screenshotFailures: false,
      },
      coverage: {
        provider: 'istanbul',
      },
    },
  }),
);
