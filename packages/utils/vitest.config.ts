import path from 'path';
import { defineProject, mergeConfig } from 'vitest/config';

import defaultConfig from '../../vitest.config.js';

const config = mergeConfig(
  defaultConfig,
  defineProject({
    test: {
      name: 'utils',
      setupFiles: path.resolve(__dirname, '../shims/src/endoify.js'),
    },
  }),
);

config.test.coverage.thresholds = true;

export default config;
