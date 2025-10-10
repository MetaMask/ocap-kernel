import { mergeConfig } from '@ocap/repo-tools/vitest-config';
import { defineConfig, defineProject } from 'vitest/config';

import defaultConfig from '../../vitest.config.ts';

export default defineConfig((args) => {
  return mergeConfig(
    args,
    defaultConfig,
    defineProject({
      test: {
        name: 'kernel-agents-e2e',
        // E2E test configuration
        testTimeout: 30000,
        hookTimeout: 10000,

        // Include only E2E tests
        include: ['./test/e2e/**/*.test.ts'],
      },
    }),
  );
});
