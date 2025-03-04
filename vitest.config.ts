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
          statements: 83.01,
          functions: 83.51,
          branches: 80.45,
          lines: 82.95,
        },
        'packages/kernel/**': {
          statements: 74.69,
          functions: 69.48,
          branches: 59.72,
          lines: 75.06,
        },
        'packages/nodejs/**': {
          statements: 74.46,
          functions: 83.33,
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
          statements: 98,
          functions: 100,
          branches: 91.17,
          lines: 97.97,
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
