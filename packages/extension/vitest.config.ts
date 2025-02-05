import { mergeConfig } from '@ocap/test-utils/vitest-config';
import path from 'path';
import { defineConfig, defineProject } from 'vitest/config';

import defaultConfig from '../../vitest.config.js';

export default defineConfig((args) => {
  delete defaultConfig.test?.setupFiles;

  return mergeConfig(
    args,
    defaultConfig,
    defineProject({
      test: {
        name: 'extension',
        environment: 'jsdom',
        exclude: ['**/test/e2e/**'],
        setupFiles: path.resolve(__dirname, './test/setup.ts'),
        testTimeout: 3000,
      },
    }),
  );
});
