import { defineConfig, defineProject, mergeConfig } from 'vitest/config';

import defaultConfig from '../../vitest.config.js';

export default defineConfig(() => {
  delete defaultConfig.test?.setupFiles;

  const config = mergeConfig(
    defaultConfig,
    defineProject({
      test: {
        name: 'cli-integration',
        include: ['**/test/integration/**'],
      },
    }),
  );

  // Integration tests don't need coverage
  delete config.test?.coverage;

  return config;
});
