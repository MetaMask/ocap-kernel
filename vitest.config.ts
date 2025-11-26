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
          statements: 49.69,
          functions: 91.3,
          branches: 92.42,
          lines: 49.69,
        },
        'packages/create-package/**': {
          statements: 99.66,
          functions: 100,
          branches: 98.3,
          lines: 99.66,
        },
        'packages/extension/**': {
          statements: 3.62,
          functions: 0,
          branches: 0,
          lines: 3.62,
        },
        'packages/kernel-agents/**': {
          statements: 94.15,
          functions: 94.64,
          branches: 91.39,
          lines: 94.15,
        },
        'packages/kernel-browser-runtime/**': {
          statements: 83.71,
          functions: 90.9,
          branches: 94.16,
          lines: 83.71,
        },
        'packages/kernel-errors/**': {
          statements: 100,
          functions: 100,
          branches: 100,
          lines: 100,
        },
        'packages/kernel-language-model-service/**': {
          statements: 100,
          functions: 100,
          branches: 100,
          lines: 100,
        },
        'packages/kernel-platforms/**': {
          statements: 99.38,
          functions: 100,
          branches: 96.2,
          lines: 99.38,
        },
        'packages/kernel-rpc-methods/**': {
          statements: 100,
          functions: 100,
          branches: 100,
          lines: 100,
        },
        'packages/kernel-shims/**': {
          statements: 0,
          functions: 0,
          branches: 0,
          lines: 0,
        },
        'packages/kernel-store/**': {
          statements: 98.45,
          functions: 100,
          branches: 91.89,
          lines: 98.45,
        },
        'packages/kernel-ui/**': {
          statements: 97.57,
          functions: 97.29,
          branches: 93.25,
          lines: 97.57,
        },
        'packages/kernel-utils/**': {
          statements: 100,
          functions: 100,
          branches: 100,
          lines: 100,
        },
        'packages/logger/**': {
          statements: 100,
          functions: 94.73,
          branches: 98.21,
          lines: 100,
        },
        'packages/nodejs/**': {
          statements: 87.76,
          functions: 88.23,
          branches: 95.34,
          lines: 87.76,
        },
        'packages/nodejs-test-workers/**': {
          statements: 22.22,
          functions: 50,
          branches: 33.33,
          lines: 22.22,
        },
        'packages/ocap-kernel/**': {
          statements: 96.6,
          functions: 98.52,
          branches: 97.54,
          lines: 96.6,
        },
        'packages/omnium-gatherum/**': {
          statements: 5.67,
          functions: 20,
          branches: 20,
          lines: 5.67,
        },
        'packages/remote-iterables/**': {
          statements: 100,
          functions: 100,
          branches: 100,
          lines: 100,
        },
        'packages/streams/**': {
          statements: 100,
          functions: 100,
          branches: 100,
          lines: 100,
        },
        'packages/template-package/**': {
          statements: 100,
          functions: 100,
          branches: 100,
          lines: 100,
        },
      },
    },
  },
});
