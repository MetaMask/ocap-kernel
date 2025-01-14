import path from 'path';
import { defineProject, mergeConfig } from 'vitest/config';

import defaultConfig from '../../vitest.config.js';

const config = mergeConfig(
  defaultConfig,
  defineProject({
    test: {
      name: 'kernel',
      setupFiles: path.resolve(__dirname, '../shims/src/endoify.js'),
    },
  }),
);

delete config.test.coverage.thresholds;
export default config;
