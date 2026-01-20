import { mergeConfig } from '@ocap/repo-tools/vitest-config';
import path from 'node:path';
import { defineConfig, defineProject } from 'vitest/config';

import defaultConfig from '../../vitest.config.ts';

export default defineConfig((args) => {
  delete defaultConfig.test?.setupFiles;

  return mergeConfig(
    args,
    defaultConfig,
    defineProject({
      resolve: {
        alias: {
          // Handle packages that import react/jsx-runtime.js with .js extension
          'react/jsx-runtime.js': 'react/jsx-runtime',
          'react/jsx-dev-runtime.js': 'react/jsx-dev-runtime',
        },
      },
      test: {
        name: 'kernel-ui',
        environment: 'jsdom',
        setupFiles: path.resolve(import.meta.dirname, './test/setup.ts'),
        testTimeout: 3000,
        deps: {
          optimizer: {
            web: {
              include: [
                '@radix-ui/react-slot',
                '@metamask/design-system-react',
              ],
            },
          },
        },
      },
    }),
  );
});
