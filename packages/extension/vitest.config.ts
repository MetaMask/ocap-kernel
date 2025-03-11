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
      resolve: {
        alias: {
          // Vite can't find the source files from the /browser export,
          // unless we use a path alias.
          '@ocap/streams/browser': path.resolve(
            __dirname,
            '../streams/src/browser/index.ts',
          ),
        },
      },
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
