import { mergeConfig } from '@ocap/test-utils/vitest-config';
import { defineConfig, defineProject } from 'vitest/config';

import defaultConfig from '../../vitest.config.js';

export default defineConfig((args) => {
  return mergeConfig(
    args,
    defaultConfig,
    defineProject({
      build: {
        ssr: true,
        rollupOptions: {
          output: {
            esModule: true,
          },
        },
      },
      test: {
        name: 'cli',
        exclude: ['**/test/integration/**'],
      },
    }),
  );
});
