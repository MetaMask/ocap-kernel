import { mergeConfig } from '@ocap/repo-tools/vitest-config';
import { defineConfig, defineProject } from 'vitest/config';

import defaultConfig from '../../vitest.config.ts';

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
        name: 'brow2brow',
        exclude: ['**/test/integration/**'],
      },
    }),
  );
});
