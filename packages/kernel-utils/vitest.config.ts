import { mergeConfig } from '@ocap/repo-tools/vitest-config';
import path from 'path';
import { defineConfig, defineProject } from 'vitest/config';

import defaultConfig from '../../vitest.config.ts';

export default defineConfig((args) => {
  return mergeConfig(
    args,
    defaultConfig,
    defineProject({
      test: {
        name: 'utils',
        setupFiles: path.resolve(
          __dirname,
          '../test-utils/src/env/mock-endoify.ts',
        ),
      },
    }),
  );
});
