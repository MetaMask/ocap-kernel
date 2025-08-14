import { defineConfig, defineProject, mergeConfig } from 'vitest/config';

import defaultConfig from '../../vitest.config.ts';

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

  delete config.test?.coverage;
  delete config.test?.projects;

  return config;
});
