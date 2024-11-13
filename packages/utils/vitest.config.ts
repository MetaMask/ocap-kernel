import { defineProject, mergeConfig } from 'vitest/config';

import defaultConfig from '../../vitest.config.js';

export default mergeConfig(
  defaultConfig,
  defineProject({
    test: {
      setupFiles: '../test-utils/src/env/mock-endo.ts',
    },
  }),
);
