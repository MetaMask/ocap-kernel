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
          statements: 2.97,
          functions: 0,
          branches: 0,
          lines: 2.97,
        },
        'packages/kernel-agents/**': {
          statements: 0,
          functions: 50,
          branches: 50,
          lines: 0,
        },
        'packages/kernel-browser-runtime/**': {
          statements: 84.21,
          functions: 90.62,
          branches: 93.33,
          lines: 84.21,
        },
        'packages/kernel-errors/**': {
          statements: 0,
          functions: 23.8,
          branches: 23.8,
          lines: 0,
        },
        'packages/kernel-language-model-service/**': {
          statements: 0,
          functions: 62.5,
          branches: 62.5,
          lines: 0,
        },
        'packages/kernel-platforms/**': {
          statements: 99.38,
          functions: 100,
          branches: 96.25,
          lines: 99.38,
        },
        'packages/kernel-rpc-methods/**': {
          statements: 0,
          functions: 25,
          branches: 25,
          lines: 0,
        },
        'packages/kernel-shims/**': {
          statements: 0,
          functions: 0,
          branches: 0,
          lines: 0,
        },
        'packages/kernel-store/**': {
          statements: 0,
          functions: 50,
          branches: 50,
          lines: 0,
        },
        'packages/kernel-ui/**': {
          statements: 0,
          functions: 10.81,
          branches: 10.81,
          lines: 0,
        },
        'packages/kernel-utils/**': {
          statements: 0,
          functions: 0,
          branches: 0,
          lines: 0,
        },
        'packages/logger/**': {
          statements: 100,
          functions: 95.23,
          branches: 98.36,
          lines: 100,
        },
        'packages/nodejs/**': {
          statements: 87.76,
          functions: 88.23,
          branches: 95.34,
          lines: 87.76,
        },
        'packages/nodejs-test-workers/**': {
          statements: 0,
          functions: 33.33,
          branches: 33.33,
          lines: 0,
        },
        'packages/ocap-kernel/**': {
          statements: 96.6,
          functions: 98.52,
          branches: 97.54,
          lines: 96.6,
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
          statements: 0,
          functions: 76.92,
          branches: 76.92,
          lines: 0,
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
