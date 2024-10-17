// eslint-disable-next-line spaced-comment
/// <reference types="vitest" />

import { defineConfig, mergeConfig } from 'vite';

import { getDefaultConfig } from '../../vitest.config.packages.js';

const defaultConfig = getDefaultConfig();

const config = mergeConfig(
  defaultConfig,
  defineConfig({
    test: {
      pool: 'vmThreads',
      setupFiles: '../test-utils/src/env/mock-endo.ts',
    },
  }),
);

export default config;
