import { mergeConfig } from '@ocap/test-utils/vitest-config';
import path from 'node:path';
import { defineConfig, defineProject } from 'vitest/config';

import defaultConfig from '../../vitest.config.js';

export default defineConfig((args) => {
  return mergeConfig(
    args,
    defaultConfig,
    defineProject({
      optimizeDeps: { include: ['better-sqlite3'] },
      test: {
        name: 'nodejs',
        pool: 'forks',
        alias: [
          {
            find: '@ocap/shims/endoify',
            replacement: path.resolve(__dirname, '../shims/src/endoify.js'),
            customResolver: (id) => ({ external: true, id }),
          },
        ],
        include: ['./src/**/*.test.ts'],
        exclude: ['./test/e2e/'],
      },
    }),
  );
});
