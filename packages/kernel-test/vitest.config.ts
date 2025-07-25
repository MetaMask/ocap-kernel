import path from 'path';
import { defineProject, mergeConfig } from 'vitest/config';

import defaultConfig from '../../vitest.config.ts';

const { NODE_ENV } = process.env;

const config = mergeConfig(
  defaultConfig,
  defineProject({
    test: {
      name: 'kernel-test',
      env: { NODE_ENV },
      setupFiles: path.resolve(__dirname, '../kernel-shims/src/endoify.js'),
      testTimeout: 30_000,
    },
  }),
);

config.test.coverage.thresholds = true;

export default config;
