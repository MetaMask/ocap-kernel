import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tsconfigPathsPlugin from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  optimizeDeps: {
    exclude: ['@sqlite.org/sqlite-wasm'],
    include: ['@vitest/coverage-v8', 'vitest-fetch-mock', 'better-sqlite3'],
  },

  plugins: [
    // Resolve imports using the "paths" property of the relevant tsconfig.json,
    // if possible.
    tsconfigPathsPlugin(),
  ],

  test: {
    environment: 'node',
    pool: 'threads',
    projects: ['packages/*'],
    silent: true,
    testTimeout: 2000,
    restoreMocks: true,
    reporters: [
      [
        'default',
        {
          summary: false,
        },
      ],
    ],
    setupFiles: [
      fileURLToPath(
        import.meta.resolve('@ocap/repo-tools/test-utils/fetch-mock'),
      ),
    ],
    alias: [
      {
        find: '@metamask/kernel-shims/endoify',
        replacement: path.join(
          import.meta.dirname,
          './packages/kernel-shims/src/endoify.js',
        ),
        customResolver: (id) => ({ external: true, id }),
      },
    ],
    coverage: {
      enabled: true,
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      include: ['**/src/**/*.{ts,tsx}'],
      exclude: [
        '**/coverage/**',
        '**/dist/**',
        '**/test/**',
        '**/node_modules/**',
        '**/*.{test,spec}.{ts,tsx,js,jsx}',
        path.join(import.meta.dirname, './packages/brow-2-brow/**'),
      ],
      thresholds: {
        autoUpdate: true,
        'packages/cli/**': {
          statements: 0,
          functions: 22.22,
          branches: 22.22,
          lines: 0,
        },
        'packages/create-package/**': {
          statements: 0,
          functions: 57.14,
          branches: 57.14,
          lines: 0,
        },
        'packages/extension/**': {
          statements: 0,
          functions: 0,
          branches: 0,
          lines: 0,
        },
        'packages/kernel-agents/**': {
          statements: 0.36,
          functions: 46.51,
          branches: 48.78,
          lines: 0.36,
        },
        'packages/kernel-browser-runtime/**': {
          statements: 0,
          functions: 60.71,
          branches: 60.71,
          lines: 0,
        },
        'packages/kernel-errors/**': {
          statements: 48.72,
          functions: 26.31,
          branches: 100,
          lines: 48.72,
        },
        'packages/kernel-language-model-service/**': {
          statements: 0,
          functions: 62.5,
          branches: 62.5,
          lines: 0,
        },
        'packages/kernel-platforms/**': {
          statements: 7.03,
          functions: 33.33,
          branches: 33.33,
          lines: 7.03,
        },
        'packages/kernel-rpc-methods/**': {
          statements: 79.09,
          functions: 85,
          branches: 78.26,
          lines: 79.09,
        },
        'packages/kernel-shims/**': {
          statements: 0,
          functions: 0,
          branches: 0,
          lines: 0,
        },
        'packages/kernel-store/**': {
          statements: 36.34,
          functions: 75,
          branches: 66.66,
          lines: 36.34,
        },
        'packages/kernel-ui/**': {
          statements: 0,
          functions: 10.81,
          branches: 10.81,
          lines: 0,
        },
        'packages/kernel-utils/**': {
          statements: 28.47,
          functions: 26.08,
          branches: 100,
          lines: 28.47,
        },
        'packages/logger/**': {
          statements: 84.27,
          functions: 78.94,
          branches: 70,
          lines: 84.27,
        },
        'packages/nodejs/**': {
          statements: 33.91,
          functions: 17.64,
          branches: 62.5,
          lines: 33.91,
        },
        'packages/nodejs-test-workers/**': {
          statements: 0,
          functions: 33.33,
          branches: 33.33,
          lines: 0,
        },
        'packages/ocap-kernel/**': {
          statements: 46.48,
          functions: 46.17,
          branches: 58.02,
          lines: 46.48,
        },
        'packages/omnium-gatherum/**': {
          statements: 0,
          functions: 0,
          branches: 0,
          lines: 0,
        },
        'packages/remote-iterables/**': {
          statements: 0,
          functions: 40,
          branches: 40,
          lines: 0,
        },
        'packages/streams/**': {
          statements: 38.95,
          functions: 60.97,
          branches: 72,
          lines: 38.95,
        },
        'packages/template-package/**': {
          statements: 0,
          functions: 100,
          branches: 100,
          lines: 0,
        },
      },
    },
  },
});
