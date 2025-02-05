// eslint-disable-next-line spaced-comment
/// <reference types="vitest" />

import path from 'path';
import { defineConfig, defineProject, mergeConfig } from 'vitest/config';

import defaultConfig from '../../vitest.config.js';

export default defineConfig(({ mode }) => {
  const config = mergeConfig(
    defaultConfig,
    defineProject({
      optimizeDeps: { include: ['better-sqlite3'] },
      test: {
        name: 'nodejs:e2e',
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

  if (mode === 'development') {
    delete config.test.coverage;
  } else {
    config.test.coverage.thresholds = {};
  }

  return config;
});
