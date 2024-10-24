// eslint-disable-next-line spaced-comment
/// <reference types="vitest" />

import path from 'path';
import { defineConfig, mergeConfig } from 'vite';

// @ts-expect-error - no declaration for module
import { getDefaultConfig } from '../../vitest.config.packages.js';

const defaultConfig = getDefaultConfig();

const config = mergeConfig(
  defaultConfig,
  defineConfig({
    test: {
      pool: 'vmThreads',
      setupFiles: path.resolve('../shims/src/endoify.js'),
    },
  }),
);

export default config;
