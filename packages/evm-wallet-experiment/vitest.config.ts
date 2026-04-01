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
        name: 'evm-wallet',
        setupFiles: [
          fileURLToPath(
            import.meta.resolve('@ocap/repo-tools/test-utils/mock-endoify'),
          ),
        ],
        exclude: [
          'test/integration/**',
          // Real `fetch` to localhost (Anvil); incompatible with root vitest-fetch-mock.
          // Run: yarn test:e2e:docker
          'test/e2e/docker/**',
        ],
      },
    }),
  );
});
