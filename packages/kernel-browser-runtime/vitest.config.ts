import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

import defaultConfig from '../../vitest.config.ts';

const { test: rootTest, ...rootViteConfig } = defaultConfig;

// Common test configuration from root, minus projects and setupFiles
const {
  projects: _projects,
  setupFiles: _setupFiles,
  ...commonTestConfig
} = rootTest ?? {};

export default defineConfig({
  ...rootViteConfig,

  test: {
    projects: [
      // Unit tests with mock-endoify
      {
        test: {
          ...commonTestConfig,
          name: 'kernel-browser-runtime',
          include: ['src/**/*.test.ts'],
          exclude: ['**/*.integration.test.ts'],
          setupFiles: [
            fileURLToPath(
              import.meta.resolve('@ocap/repo-tools/test-utils/fetch-mock'),
            ),
            fileURLToPath(
              import.meta.resolve('@ocap/repo-tools/test-utils/mock-endoify'),
            ),
          ],
        },
      },
      // Integration tests with real endoify
      {
        test: {
          ...commonTestConfig,
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
      },
    ],
  },
});
