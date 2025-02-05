import { defineConfig, defineProject, mergeConfig } from 'vitest/config';

import defaultConfig from '../../vitest.config.js';

export default defineConfig(({ mode }) => {
  const config = mergeConfig(
    defaultConfig,
    defineProject({
      build: {
        ssr: true,
        rollupOptions: {
          output: {
            esModule: true,
          },
        },
      },
      test: {
        name: 'cli',
        exclude: ['**/test/integration/**'],
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
