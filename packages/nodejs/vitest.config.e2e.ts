// eslint-disable-next-line spaced-comment
/// <reference types="vitest" />

import path from 'path';
import { defineConfig, mergeConfig } from 'vite';

import defaultConfig from '../../vitest.config.js';

const config = mergeConfig(
  defaultConfig,
  defineConfig({
    optimizeDeps: { include: ['better-sqlite3'] },
    test: {
      pool: 'forks',
      alias: [
        {
          find: '@ocap/shims/endoify',
          replacement: path.resolve('../shims/src/endoify.js'),
          customResolver: (id) => ({ external: true, id }),
        },
      ],
      include: ['./test/e2e/**/*.test.ts'],
      exclude: ['./src/**/*'],
    },
  }),
);

delete config.test.coverage.thresholds;
export default config;
