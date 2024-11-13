import path from 'path';
import { defineProject, mergeConfig } from 'vitest/config';

import defaultConfig from '../../vitest.config.js';

const config = mergeConfig(
  defaultConfig,
  defineProject({
    test: {
      pool: 'vmThreads',
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

export default config;
