import { mergeConfig } from '@ocap/test-utils/vitest-config';
import { defineConfig, defineProject } from 'vitest/config';

import defaultConfig from '../../vitest.config.ts';

export default defineConfig((args) => {
  return mergeConfig(
    args,
    defaultConfig,
    defineProject({
      test: {
        name: 'nodejs',
        include: ['./src/**/*.test.ts'],
        exclude: ['./test/e2e/'],
      },
    }),
  );
});
