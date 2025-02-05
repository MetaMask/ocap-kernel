import path from 'path';
import { defineConfig, defineProject, mergeConfig } from 'vitest/config';

import defaultConfig from '../../vitest.config.js';

export default defineConfig(({ mode }) => {
  delete defaultConfig.test?.setupFiles;

  const config = mergeConfig(
    defaultConfig,
    defineProject({
      test: {
        name: 'extension',
        environment: 'jsdom',
        exclude: ['**/test/e2e/**'],
        setupFiles: path.resolve(__dirname, './test/setup.ts'),
        testTimeout: 3000,
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
