import { mergeConfig } from '@ocap/repo-tools/vitest-config';
import { playwright } from '@vitest/browser-playwright';
import { fileURLToPath } from 'node:url';
import { defineConfig, defineProject } from 'vitest/config';

import defaultConfig from '../../vitest.config.ts';

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
              setupFiles: [
                fileURLToPath(
                  import.meta.resolve(
                    '@ocap/repo-tools/test-utils/mock-endoify',
                  ),
                ),
              ],
            }
          : {
              setupFiles: '../kernel-shims/src/endoify.js',
              browser: {
                enabled: true,
                provider: playwright(),
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
