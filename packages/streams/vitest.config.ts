import { mergeConfig } from '@ocap/test-utils/vitest-config';
import { defineConfig, defineProject } from 'vitest/config';

import defaultConfig from '../../vitest.config.js';

export default defineConfig((args) => {
  delete defaultConfig.test?.environment;

  return mergeConfig(
    args,
    defaultConfig,
    defineProject({
      test: {
        name: 'streams',
        ...(args.mode === 'development'
          ? {
              environment: 'jsdom',
              setupFiles: ['../test-utils/src/env/mock-endoify.ts'],
            }
          : {
              setupFiles: '../shims/src/endoify.js',
              browser: {
                enabled: true,
                provider: 'playwright',
                instances: [
                  {
                    browser: 'chromium',
                    headless: true,
                    screenshotFailures: false,
                  },
                ],
              },
            }),
      },
    }),
  );
});
