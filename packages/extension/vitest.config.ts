// eslint-disable-next-line spaced-comment
/// <reference types="vitest" />
import path from 'path';
import { defineConfig, mergeConfig } from 'vitest/config';

import viteConfig from './vite.config.js';
import { getDefaultConfig } from '../../vitest.config.packages.js';

const defaultConfig = getDefaultConfig();

const config = mergeConfig(
  viteConfig,
  mergeConfig(
    defaultConfig,
    defineConfig({
      test: {
        pool: 'vmThreads',
        alias: [
          {
            find: '@ocap/shims/endoify',
            replacement: path.resolve('../shims/src/endoify.js'),
            // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
            customResolver: (id) => ({ external: true, id }),
          },
        ],
      },
    }),
  ),
);

delete config.test.coverage.thresholds;

export default config;
