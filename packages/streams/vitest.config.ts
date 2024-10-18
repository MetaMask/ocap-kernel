// eslint-disable-next-line spaced-comment
/// <reference types="vitest" />

import path from 'path';
import { defineConfig, mergeConfig } from 'vite';

import { getDefaultConfig } from '../../vitest.config.packages.js';

const defaultConfig = getDefaultConfig();
delete defaultConfig.test?.environment;

export default mergeConfig(
  defaultConfig,
  defineConfig({
    test: {
      browser: {
        provider: 'playwright',
        name: 'chromium',
        enabled: true,
        headless: true,
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
