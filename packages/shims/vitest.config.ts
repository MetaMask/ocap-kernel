// eslint-disable-next-line spaced-comment
/// <reference types="vitest" />

import { defineConfig, mergeConfig } from 'vite';

import { getDefaultConfig } from '../../vitest.config.packages.js';

const defaultConfig = getDefaultConfig();

const config = mergeConfig(
  defaultConfig,
  defineConfig({
    test: {
      exclude: ['endoify-*shimmed.test.*'],
    },
  }),
);

// @ts-expect-error We can and will delete this.
delete config.test.coverage.thresholds;
export default config;
