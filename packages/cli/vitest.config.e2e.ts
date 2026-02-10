import { mergeConfig } from '@ocap/repo-tools/vitest-config';
import { defineConfig, defineProject } from 'vitest/config';

import defaultConfig from '../../vitest.config.ts';

export default defineConfig((args) => {
  return mergeConfig(
    args,
    defaultConfig,
    defineProject({
      test: {
        name: 'cli:e2e',
        pool: 'forks',
        include: ['./test/e2e/**/*.test.ts'],
        exclude: ['./src/**/*'],
        hookTimeout: 30_000,
        testTimeout: 60_000,
      },
    }),
  );
});
