import { mergeConfig } from '@ocap/test-utils/vitest-config';
import { defineConfig, defineProject } from 'vitest/config';

import defaultConfig from '../../vitest.config.ts';

export default defineConfig((args) => {
  return mergeConfig(
    args,
    defaultConfig,
    defineProject({
      esbuild: {
        exclude: ['./src/package-template/**'],
      },
      test: {
        name: 'create-package',
        exclude: ['./src/package-template/**'],
      },
    }),
  );
});
