import path from 'path';
import { defineProject, mergeConfig } from 'vitest/config';

import defaultConfig from '../../vitest.config.js';

delete defaultConfig.test?.setupFiles;

const config = mergeConfig(
  defaultConfig,
  defineProject({
    test: {
      name: 'cli-integration',
      include: ['**/test/integration/**'],
      alias: [
        {
          find: '@ocap/shims/endoify',
          replacement: path.resolve(__dirname, '../shims/src/endoify.js'),
          customResolver: (id) => ({ external: true, id }),
        },
      ],
    },
  }),
);

// Integration tests don't need coverage
delete config.test.coverage;

export default config;
