// eslint-disable-next-line spaced-comment
/// <reference types="vitest" />

import path from 'path';
import { defineConfig, mergeConfig } from 'vite';

import { getDefaultConfig } from '../../vitest.config.packages.js';

const defaultConfig = getDefaultConfig();

const config = mergeConfig(
  defaultConfig,
  defineConfig({
    test: {
      pool: 'vmThreads',
      setupFiles: path.resolve('../shims/src/endoify.js'),
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

export default config;
