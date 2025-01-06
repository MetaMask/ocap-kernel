import { defineProject, mergeConfig } from 'vitest/config';

import defaultConfig from '../../vitest.config.js';

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

config.test.coverage.thresholds = true;

export default config;
