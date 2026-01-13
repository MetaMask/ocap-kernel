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
        name: 'nodejs',
        setupFiles: [
          fileURLToPath(
            import.meta.resolve('@metamask/kernel-shims/node-endoify'),
          ),
        ],
        include: ['./src/**/*.test.ts'],
        exclude: ['./test/e2e/'],
      },
    }),
  );
});
