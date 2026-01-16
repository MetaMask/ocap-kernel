import { mergeConfig } from '@ocap/repo-tools/vitest-config';
import { fileURLToPath } from 'node:url';
import { defineConfig, defineProject } from 'vitest/config';

import defaultConfig from '../../vitest.config.ts';

export default defineConfig((args) => {
  delete defaultConfig.test?.setupFiles;

  const config = mergeConfig(
    args,
    defaultConfig,
    defineProject({
      test: {
        name: 'kernel-browser-runtime:integration',
        include: ['src/**/*.integration.test.ts'],
        setupFiles: [
          fileURLToPath(
            import.meta.resolve('@ocap/repo-tools/test-utils/fetch-mock'),
          ),
        ],
      },
    }),
  );

  delete config.test?.coverage;

  return config;
});
