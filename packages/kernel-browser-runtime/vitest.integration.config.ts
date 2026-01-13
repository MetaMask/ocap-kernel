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
          // Use node-endoify which imports @libp2p/webrtc before lockdown
          // (webrtc imports reflect-metadata which modifies globalThis.Reflect)
          fileURLToPath(
            import.meta.resolve('@metamask/kernel-shims/node-endoify'),
          ),
        ],
      },
    }),
  );

  delete config.test?.coverage;

  return config;
});
