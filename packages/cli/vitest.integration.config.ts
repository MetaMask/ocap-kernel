import { defineConfig, defineProject, mergeConfig } from 'vitest/config';

import defaultConfig from '../../vitest.config.js';

export default defineConfig(() => {
  delete defaultConfig.test?.setupFiles;

  // We do not use our custom mergeConfig here
  const config = mergeConfig(
    defaultConfig,
    defineProject({
      test: {
        name: 'cli-integration',
        include: ['**/test/integration/**'],
      },
    }),
  );

  // Integration shouldn't have coverage
  delete config.test?.coverage;

  return config;
});
