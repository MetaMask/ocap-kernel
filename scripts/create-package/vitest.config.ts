import { defineConfig, defineProject } from 'vitest/config';

import { mergeConfig } from '../../packages/test-utils/src/vitest-config';
import defaultConfig from '../../vitest.config.js';

export default defineConfig((args) => {
  return mergeConfig(
    args,
    defaultConfig,
    defineProject({
      esbuild: {
        exclude: ['./package-template/**'],
      },
      test: {
        name: 'scripts/create-package',
        exclude: ['./package-template/**'],
      },
    }),
  );
});
