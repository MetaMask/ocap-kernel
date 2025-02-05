// eslint-disable-next-line spaced-comment
/// <reference types="vitest" />

import { mergeConfig } from '@ocap/test-utils/vitest-config';
import path from 'path';
import { defineConfig, defineProject } from 'vitest/config';

import defaultConfig from '../../vitest.config.js';

export default defineConfig((args) => {
  return mergeConfig(
    args,
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
});
