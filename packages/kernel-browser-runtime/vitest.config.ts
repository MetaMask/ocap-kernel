import { mergeConfig } from '@ocap/repo-tools/vitest-config';
import { fileURLToPath } from 'node:url';
import { defineConfig, defineProject } from 'vitest/config';

import defaultConfig from '../../vitest.config.ts';

export default defineConfig((args) => {
  return mergeConfig(
    args,
    defaultConfig,
    defineProject({
      test: {
        name: 'kernel-browser-runtime',
        include: ['src/**/*.test.ts'],
        exclude: ['**/*.integration.test.ts'],
        setupFiles: [
          fileURLToPath(
            import.meta.resolve('@ocap/repo-tools/test-utils/fetch-mock'),
          ),
          fileURLToPath(
            import.meta.resolve('@ocap/repo-tools/test-utils/mock-endoify'),
          ),
        ],
      },
    }),
  );
});
