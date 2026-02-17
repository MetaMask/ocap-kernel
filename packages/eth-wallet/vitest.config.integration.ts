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
        name: 'eth-wallet:integration',
        pool: 'forks',
        setupFiles: [
          fileURLToPath(
            import.meta.resolve('@metamask/kernel-shims/endoify-node'),
          ),
        ],
        include: ['./test/integration/**/*.test.ts'],
        exclude: ['./src/**/*'],
        hookTimeout: 30_000,
        testTimeout: 30_000,
        env: {
          LOCKDOWN_ERROR_TRAPPING: 'none',
        },
      },
    }),
  );
});
