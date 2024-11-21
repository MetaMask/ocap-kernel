import path from 'path';
import { defineProject, mergeConfig } from 'vitest/config';

import defaultConfig from '../../vitest.config.js';

const config = mergeConfig(
  defaultConfig,
  defineProject({
    test: {
      name: 'kernel',
      alias: [
        {
          find: '@ocap/shims/endoify',
          replacement: path.resolve('../shims/src/endoify.js'),
          customResolver: (id) => ({ external: true, id }),
        },
      ],
    },
  }),
);

delete config.test.coverage.thresholds;
export default config;
