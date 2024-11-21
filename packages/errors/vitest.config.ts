import path from 'path';
import { defineProject, mergeConfig } from 'vitest/config';

import defaultConfig from '../../vitest.config.js';

const config = mergeConfig(
  defaultConfig,
  defineProject({
    test: {
      name: 'errors',
      setupFiles: path.resolve('../shims/src/endoify.js'),
      poolMatchGlobs: [
        ['**/marshal/*.test.ts', 'threads'],
        ['**/utils/*.test.ts', 'threads'],
        ['**/*.test.ts', 'forks'],
      ],
    },
  }),
);

config.test.coverage.thresholds = true;

export default config;
