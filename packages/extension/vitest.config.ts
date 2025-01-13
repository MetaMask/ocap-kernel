import path from 'path';
import { defineProject, mergeConfig } from 'vitest/config';

import defaultConfig from '../../vitest.config.js';

delete defaultConfig.test?.setupFiles;

const config = mergeConfig(
  defaultConfig,
  defineProject({
    test: {
      name: 'extension',
      environment: 'jsdom',
      pool: 'vmForks',
      exclude: ['**/test/e2e/**'],
      setupFiles: path.resolve(__dirname, './test/setup.ts'),
    },
  }),
);

delete config.test.coverage.thresholds;
export default config;
