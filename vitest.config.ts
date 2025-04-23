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
        find: '@ocap/shims/endoify',
        replacement: path.join(__dirname, './packages/shims/src/endoify.js'),
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
      ],
      thresholds: {
        autoUpdate: true,
        'packages/cli/**': {
          statements: 69.46,
          functions: 66.66,
          branches: 88.23,
          lines: 69.23,
        },
        'packages/create-package/**': {
          statements: 100,
          functions: 100,
          branches: 100,
          lines: 100,
        },
        'packages/errors/**': {
          statements: 98.63,
          functions: 95.23,
          branches: 92,
          lines: 98.63,
        },
        'packages/extension/**': {
          statements: 78.75,
          functions: 80.72,
          branches: 74.46,
          lines: 78.59,
        },
        'packages/kernel/**': {
          statements: 90.55,
          functions: 92.27,
          branches: 79.57,
          lines: 90.53,
        },
        'packages/nodejs/**': {
          statements: 72.91,
          functions: 83.33,
          branches: 63.63,
          lines: 72.91,
        },
        'packages/rpc-methods/**': {
          statements: 100,
          functions: 100,
          branches: 100,
          lines: 100,
        },
        'packages/shims/**': {
          statements: 0,
          functions: 0,
          branches: 0,
          lines: 0,
        },
        'packages/store/**': {
          statements: 92.44,
          functions: 91.17,
          branches: 84.78,
          lines: 92.39,
        },
        'packages/streams/**': {
          statements: 100,
          functions: 100,
          branches: 100,
          lines: 100,
        },
        'packages/utils/**': {
          statements: 100,
          functions: 100,
          branches: 100,
          lines: 100,
        },
      },
    },
  },
});
