import { mergeConfig } from '@ocap/repo-tools/vitest-config';
import { defineConfig, defineProject } from 'vitest/config';

import defaultConfig from '../../vitest.config.ts';

export default defineConfig((args) => {
  return mergeConfig(
    args,
    defaultConfig,
    defineProject({
      test: {
        name: 'kernel-test-local',
        testTimeout: 30_000,
        hookTimeout: 10_000,
        include: ['./src/**/*.test.ts'],
      },
    }),
  );
});
