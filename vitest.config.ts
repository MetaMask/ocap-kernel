import path from 'path';
import tsconfigPathsPlugin from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  optimizeDeps: {
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
          statements: 63.24,
          functions: 63.41,
          branches: 63.33,
          lines: 63.24,
        },
        'packages/create-package/**': {
          statements: 100,
          functions: 100,
          branches: 100,
          lines: 100,
        },
        'packages/errors/**': {
          statements: 100,
          functions: 100,
          branches: 92,
          lines: 100,
        },
        'packages/extension/**': {
          statements: 83.54,
          functions: 84.1,
          branches: 81.29,
          lines: 83.42,
        },
        'packages/kernel/**': {
          statements: 74.73,
          functions: 69.32,
          branches: 59.86,
          lines: 75.08,
        },
        'packages/nodejs/**': {
          statements: 72.91,
          functions: 76.92,
          branches: 63.63,
          lines: 74.46,
        },
        'packages/shims/**': {
          statements: 0,
          functions: 0,
          branches: 0,
          lines: 0,
        },
        'packages/store/**': {
          statements: 93.6,
          functions: 93.93,
          branches: 78.57,
          lines: 93.56,
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
