import { mergeConfig } from '@ocap/test-utils/vitest-config';
import path from 'path';
import { defineConfig, defineProject } from 'vitest/config';

import defaultConfig from '../../vitest.config.ts';

export default defineConfig((args) => {
  return mergeConfig(
    args,
    defaultConfig,
    defineProject({
      test: {
        name: 'kernel-language-model-service:e2e',
        setupFiles: path.resolve(__dirname, '../kernel-shims/src/endoify.js'),
        include: ['./test/e2e/**/*.test.ts'],
        exclude: ['./src/**/*'],
      },
    }),
  );
});
