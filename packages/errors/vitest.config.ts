import path from 'path';
import { defineProject, mergeConfig } from 'vitest/config';

import defaultConfig from '../../vitest.config.js';

const config = mergeConfig(
  defaultConfig,
  defineProject({
    test: {
      pool: 'vmThreads',
      setupFiles: path.resolve('../shims/src/endoify.js'),
    },
  }),
);

export default config;
