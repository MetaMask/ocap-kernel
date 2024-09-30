// eslint-disable-next-line spaced-comment
/// <reference types="vitest" />

import { defineConfig, mergeConfig } from 'vite';

import { getDefaultConfig } from '../../vitest.config.packages.js';

const defaultConfig = getDefaultConfig();

export default mergeConfig(
  defaultConfig,
  defineConfig({
    test: {
      restoreMocks: false, // TODO:vitest-bug disabling restoreMocks fixes the issue
      // mockReset: true,
      // clearMocks: true,
      setupFiles: '../test-utils/src/env/mock-endo.ts',
    },
  }),
);
