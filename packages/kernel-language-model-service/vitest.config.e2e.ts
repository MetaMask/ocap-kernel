import { mergeConfig } from '@ocap/repo-tools/vitest-config';
import path from 'node:path';
import { defineConfig, defineProject } from 'vitest/config';

import defaultConfig from '../../vitest.config.ts';

export default defineConfig((args) => {
  return mergeConfig(
    args,
    defaultConfig,
    defineProject({
      test: {
        name: 'kernel-language-model-service:e2e',
        setupFiles: path.resolve(
          import.meta.dirname,
          '../kernel-shims/src/endoify.js',
        ),
        include: ['./test/e2e/**/*.test.ts'],
        exclude: ['./src/**/*'],
      },
    }),
  );
});
