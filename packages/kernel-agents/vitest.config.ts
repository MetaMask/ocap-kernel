import { mergeConfig } from '@ocap/repo-tools/vitest-config';
import { defineConfig, defineProject } from 'vitest/config';

import defaultConfig from '../../vitest.config.ts';

export default defineConfig((args) => {
  return mergeConfig(
    args,
    defaultConfig,
    defineProject({
      test: {
        name: 'kernel-agents',
        include: ['src/**/*.test.ts'],
        // Exclude E2E setup test from regular test runs
        exclude: ['test/e2e'],
      },
    }),
  );
});
