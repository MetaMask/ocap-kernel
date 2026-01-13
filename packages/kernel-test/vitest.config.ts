import { mergeConfig } from '@ocap/repo-tools/vitest-config';
import { fileURLToPath } from 'node:url';
import { defineConfig, defineProject } from 'vitest/config';

import defaultConfig from '../../vitest.config.ts';

export default defineConfig((args) => {
  const config = mergeConfig(
    args,
    defaultConfig,
    defineProject({
      test: {
        name: 'kernel-test',
        setupFiles: [
          fileURLToPath(
            import.meta.resolve('@metamask/kernel-shims/node-endoify'),
          ),
        ],
        testTimeout: 30_000,
      },
    }),
  );

  if (args.mode !== 'development') {
    config.test.coverage.thresholds = true;
  }

  return config;
});
