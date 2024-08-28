// eslint-disable-next-line spaced-comment
/// <reference types="vitest" />

import { defineConfig, mergeConfig } from 'vitest/config';

import viteConfig from './vite.config.js';
import { getDefaultConfig } from '../../vitest.config.packages.js';

const defaultConfig = getDefaultConfig();
// @ts-expect-error We can and will delete this.
delete defaultConfig.test.coverage.thresholds;

export default mergeConfig(
  viteConfig,
  mergeConfig(
    defaultConfig,
    defineConfig({
      test: {
        setupFiles: '../test-utils/src/env/mock-endo.ts',
      },
    }),
  ),
);
