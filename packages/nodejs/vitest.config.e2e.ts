import { mergeConfig } from '@ocap/test-utils/vitest-config';
import { defineConfig, defineProject } from 'vitest/config';

import defaultConfig from '../../vitest.config.ts';

export default defineConfig((args) => {
  const config = mergeConfig(
    args,
    defaultConfig,
    defineProject({
      test: {
        name: 'nodejs:e2e',
        pool: 'forks',
        include: ['./test/e2e/**/*.test.ts'],
        exclude: ['./src/**/*'],
      },
    }),
  );

  delete config.test?.projects;

  return config;
});
