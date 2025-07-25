import { mergeConfig } from '@ocap/test-utils/vitest-config';
import path from 'path';
import { defineConfig, defineProject } from 'vitest/config';

import defaultConfig from '../../vitest.config.ts';

export default defineConfig((args) => {
  delete defaultConfig.test?.setupFiles;

  return mergeConfig(
    args,
    defaultConfig,
    defineProject({
      test: {
        name: 'kernel-ui',
        environment: 'jsdom',
        setupFiles: path.resolve(__dirname, './test/setup.ts'),
        testTimeout: 3000,
      },
    }),
  );
});
