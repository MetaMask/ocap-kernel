import { defineProject, mergeConfig } from 'vitest/config';

import defaultConfig from '../../vitest.config.js';

export default mergeConfig(
  defaultConfig,
  defineProject({
    test: {
      name: 'nodejs',
      pool: 'forks',
      include: ['./src/**/*.test.ts'],
      exclude: ['./test/e2e/'],
    },
  }),
);
