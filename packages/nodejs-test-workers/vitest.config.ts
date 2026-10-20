import { mergeConfig } from '@ocap/repo-tools/vitest-config';
import { defineConfig } from 'vitest/config';

import defaultConfig from '../../vitest.config.ts';

export default defineConfig((args) => {
  return mergeConfig(
    args,
    defaultConfig,
    defineConfig({
      test: {
        name: 'nodejs-test-workers',
        passWithNoTests: true,
      },
    }),
  );
});
