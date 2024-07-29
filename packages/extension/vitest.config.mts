// eslint-disable-next-line spaced-comment
/// <reference types="vitest" />

import { defineConfig, mergeConfig } from 'vitest/config';

import { getDefaultConfig } from '../../vitest.config.packages.mjs';
import viteConfig from './vite.config.mjs';

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
