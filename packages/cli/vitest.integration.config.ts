import { mergeConfig } from '@ocap/repo-tools/vitest-config';
import { defineConfig, defineProject } from 'vitest/config';

import defaultConfig from '../../vitest.config.ts';

export default defineConfig((args) => {
  delete defaultConfig.test?.setupFiles;

  // We do not use our custom mergeConfig here
  const config = mergeConfig(
    args,
    defaultConfig,
    defineProject({
      test: {
        name: 'cli-integration',
        include: ['**/test/integration/**'],
      },
    }),
  );

  delete config.test?.coverage;

  return config;
});
