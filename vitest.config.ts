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
          statements: 89.46,
          functions: 89.88,
          branches: 82.96,
          lines: 89.51,
        },
        'packages/kernel-browser-runtime/**': {
          statements: 76.95,
          functions: 73.77,
          branches: 63.82,
          lines: 76.95,
        },
        'packages/kernel-errors/**': {
          statements: 41.77,
          functions: 21.73,
          branches: 4,
          lines: 41.77,
        },
        'packages/kernel-rpc-methods/**': {
          statements: 3.92,
          functions: 7.69,
          branches: 0,
          lines: 3.92,
        },
        'packages/kernel-shims/**': {
          statements: 0,
          functions: 0,
          branches: 0,
          lines: 0,
        },
        'packages/kernel-store/**': {
          statements: 0,
          functions: 0,
          branches: 0,
          lines: 0,
        },
        'packages/kernel-utils/**': {
          statements: 38.18,
          functions: 11.76,
          branches: 19.23,
          lines: 42,
        },
        'packages/logger/**': {
          statements: 66.66,
          functions: 54.16,
          branches: 32.43,
          lines: 68.18,
        },
        'packages/nodejs/**': {
          statements: 0,
          functions: 0,
          branches: 0,
          lines: 0,
        },
        'packages/ocap-kernel/**': {
<<<<<<< HEAD
          statements: 91.39,
          functions: 95.07,
          branches: 82.16,
          lines: 91.37,
=======
          statements: 35.84,
          functions: 41.03,
          branches: 22.66,
          lines: 35.65,
>>>>>>> f23207f3 (Add subcluster store methods)
        },
        'packages/streams/**': {
          statements: 36.53,
          functions: 32.52,
          branches: 24.48,
          lines: 36.72,
        },
      },
    },
  },
});
