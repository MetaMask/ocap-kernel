import path from 'path';
import tsconfigPathsPlugin from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  optimizeDeps: {
    exclude: ['@sqlite.org/sqlite-wasm'],
    include: [
      '@vitest/coverage-istanbul',
      'vitest-fetch-mock',
      'better-sqlite3',
    ],
  },

  plugins: [
    // Resolve imports using the "paths" property of the relevant tsconfig.json,
    // if possible.
    tsconfigPathsPlugin({
      skip: (dir) => dir === 'package-template',
    }),
  ],

  test: {
    environment: 'node',
    pool: 'threads',
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
      path.join(__dirname, './packages/test-utils/src/env/fetch-mock.ts'),
    ],
    alias: [
      {
        find: '@metamask/kernel-shims/endoify',
        replacement: path.join(
          __dirname,
          './packages/kernel-shims/src/endoify.js',
        ),
        customResolver: (id) => ({ external: true, id }),
      },
    ],
    coverage: {
      enabled: true,
      provider: 'istanbul',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      include: ['**/src/**/*.{ts,tsx}'],
      exclude: [
        '**/coverage/**',
        '**/dist/**',
        '**/test/**',
        '**/node_modules/**',
        '**/*.{test,spec}.{ts,tsx,js,jsx}',
        path.join(
          __dirname,
          './packages/create-package/src/package-template/**',
        ),
        path.join(__dirname, './packages/brow-2-brow/**'),
      ],
      thresholds: {
        autoUpdate: true,
        'packages/cli/**': {
          statements: 0,
          functions: 0,
          branches: 0,
          lines: 0,
        },
        'packages/create-package/**': {
          statements: 0,
          functions: 0,
          branches: 0,
          lines: 0,
        },
        'packages/extension/**': {
<<<<<<< HEAD
          statements: 87.65,
          functions: 87.79,
          branches: 82.25,
          lines: 87.67,
        },
        'packages/kernel-browser-runtime/**': {
          statements: 80.45,
          functions: 78.94,
          branches: 66.66,
          lines: 80.45,
=======
          statements: 0,
          functions: 0,
          branches: 0,
          lines: 0,
>>>>>>> 5ffe4069 (retrun dispatch delivery errors from VatSupervisor)
        },
        'packages/kernel-errors/**': {
          statements: 24.65,
          functions: 4.76,
          branches: 0,
          lines: 24.65,
        },
        'packages/kernel-rpc-methods/**': {
          statements: 72.54,
          functions: 69.23,
          branches: 44.44,
          lines: 72.54,
        },
        'packages/kernel-shims/**': {
          statements: 0,
          functions: 0,
          branches: 0,
          lines: 0,
        },
        'packages/kernel-store/**': {
          statements: 29.2,
          functions: 41.66,
          branches: 22.5,
          lines: 29.31,
        },
        'packages/kernel-utils/**': {
          statements: 43.63,
          functions: 35.29,
          branches: 15.38,
          lines: 44,
        },
        'packages/logger/**': {
          statements: 86.95,
          functions: 75,
          branches: 54.05,
          lines: 89.39,
        },
        'packages/nodejs/**': {
          statements: 29.62,
          functions: 30.76,
          branches: 23.07,
          lines: 30.18,
        },
        'packages/ocap-kernel/**': {
          statements: 91.58,
          functions: 94.96,
          branches: 81.89,
          lines: 91.56,
        },
        'packages/streams/**': {
          statements: 39.66,
          functions: 35.77,
          branches: 31.29,
          lines: 40.19,
        },
      },
    },
  },
});
