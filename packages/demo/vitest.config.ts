import { mergeConfig } from '@ocap/test-utils/vitest-config';
import path from 'node:path';
import { defineConfig, defineProject } from 'vitest/config';

import defaultConfig from '../../vitest.config.ts';

export default defineConfig((args) => {
  return mergeConfig(
    args,
    defaultConfig,
    defineProject({
      test: {
        name: 'demo',
        setupFiles: path.resolve(__dirname, '../kernel-shims/src/endoify.js'),
      },
    }),
  );
});
