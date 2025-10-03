import { mergeConfig } from '@ocap/repo-tools/vitest-config';
import path from 'node:path';
import { defineConfig, defineProject } from 'vitest/config';

import defaultConfig from '../../vitest.config.ts';

export default defineConfig((args) => {
  delete defaultConfig.test?.setupFiles;

  return mergeConfig(
    args,
    defaultConfig,
    defineProject({
      test: {
        name: 'omnium-gatherum',
        environment: 'jsdom',
        exclude: ['**/test/e2e/**'],
        setupFiles: path.resolve(__dirname, './test/setup.ts'),
        testTimeout: 3000,
      },
    }),
  );
});
