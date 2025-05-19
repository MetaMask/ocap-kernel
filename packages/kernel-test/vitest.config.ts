import path from 'path';
import { defineProject, mergeConfig } from 'vitest/config';

import defaultConfig from '../../vitest.config.ts';

const config = mergeConfig(
  defaultConfig,
  defineProject({
    test: {
      name: 'kernel-test',
      setupFiles: path.resolve(__dirname, '../nodejs/src/env/endoify.ts'),
      testTimeout: 30_000,
    },
  }),
);

config.test.coverage.thresholds = true;

export default config;
