import { mergeConfig } from '@ocap/test-utils/vitest-config';
import path from 'node:path';
import { defineConfig, defineProject } from 'vitest/config';

import defaultConfig from '../../vitest.config.ts';

export default defineConfig((args) => {
  const config = mergeConfig(
    args,
    defaultConfig,
    defineProject({
      test: {
        name: 'kernel-test',
        setupFiles: path.resolve(__dirname, '../nodejs/src/env/endoify.ts'),
        testTimeout: 30_000,
      },
    }),
  );

  if (args.mode !== 'development') {
    config.test.coverage.thresholds = true;
  }

  return config;
});
