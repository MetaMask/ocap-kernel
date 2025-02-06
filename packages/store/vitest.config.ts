import path from 'node:path';
import { defineProject, mergeConfig } from 'vitest/config';

import defaultConfig from '../../vitest.config.js';

export default mergeConfig(
  defaultConfig,
  defineProject({
    test: {
      name: 'store',
      setupFiles: path.resolve(__dirname, '../shims/src/endoify.js'),
    },
  }),
);
