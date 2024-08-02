// eslint-disable-next-line spaced-comment
/// <reference types="vitest" />

import { defineConfig, mergeConfig } from 'vite';

import { getDefaultConfig } from '../../vitest.config.packages.mjs';

const defaultConfig = getDefaultConfig();

export default mergeConfig(
  defaultConfig,
  defineConfig({
    test: {
      setupFiles: '../test-utils/src/env/mock-endo.ts',
    },
  }),
);
