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
        name: 'nodejs:e2e',
        pool: 'forks',
        setupFiles: [
          fileURLToPath(
            import.meta.resolve('@metamask/kernel-shims/endoify-node'),
          ),
        ],
        include: ['./test/e2e/**/*.test.ts'],
        exclude: ['./src/**/*'],
        env: {
          // Prevent SES from calling process.exit on uncaught exceptions.
          // Vitest v4+ intercepts process.exit and throws errors.
          LOCKDOWN_ERROR_TRAPPING: 'none',
        },
      },
    }),
  );
});
