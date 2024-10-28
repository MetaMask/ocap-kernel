// eslint-disable-next-line spaced-comment
/// <reference types="vitest" />

import { defineConfig, mergeConfig } from 'vite';

import { getDefaultConfig } from '../../vitest.config.packages.js';
import path from 'path';

const defaultConfig = getDefaultConfig();
delete defaultConfig.test?.environment;

export default mergeConfig(
  defaultConfig,
  defineConfig({
    test: {
      setupFiles: '../test-utils/src/env/mock-endo.ts',
      browser: {
        provider: 'playwright',
        name: 'chromium',
        enabled: true,
        headless: true,
        screenshotFailures: false,
      },
      coverage: {
        provider: "istanbul"
      },
      alias: [
        {
          find: '@ocap/shims/endoify',
          replacement: path.resolve('../shims/src/endoify.js'),
          customResolver: (id) => ({ external: true, id }),
        },
      ],
      
    },
  }),
);
