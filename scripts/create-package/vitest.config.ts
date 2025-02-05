import { defineConfig, defineProject, mergeConfig } from 'vitest/config';

import defaultConfig from '../../vitest.config.js';

export default defineConfig(({ mode }) => {
  const config = mergeConfig(
    defaultConfig,
    defineProject({
      esbuild: {
        exclude: ['./package-template/**'],
      },
      test: {
        name: 'scripts/create-package',
        exclude: ['./package-template/**'],
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
