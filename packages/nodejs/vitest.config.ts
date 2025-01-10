import path from 'node:path';
import { defineProject, mergeConfig } from 'vitest/config';

import defaultConfig from '../../vitest.config.js';

const config = mergeConfig(
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

config.test.coverage.thresholds = true;

export default config;
