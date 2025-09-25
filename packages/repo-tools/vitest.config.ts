import { defineConfig, defineProject } from 'vitest/config';

import defaultConfig from '../../vitest.config.ts';
import { mergeConfig } from '@ocap/repo-tools/vitest-config';

export default defineConfig((args) => {
  return mergeConfig(
    args,
    defaultConfig,
    defineProject({
      test: {
        name: 'repo-tools',
      },
    }),
  );
});
