import path from 'path';
import tsconfigPathsPlugin from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    // Resolve imports using the "paths" property of the relevant tsconfig.json,
    // if possible.
    tsconfigPathsPlugin(),
  ],

  optimizeDeps: {
    include: ['@vitest/coverage-istanbul', 'vitest-fetch-mock'],
  },

  test: {
    environment: 'node',
    pool: 'threads',
    silent: true,
    testTimeout: 2000,
    restoreMocks: true,
    reporters: ['basic'],
    setupFiles: [
      path.join(__dirname, './packages/test-utils/src/env/fetch-mock.ts'),
    ],
    coverage: {
      enabled: true,
      provider: 'istanbul',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      include: ['**/src/**/*.ts'],
      exclude: [
        '**/node_modules/**',
        '**/coverage/**',
        '**/dist/**',
        '**/test/**',
        '**/*.{test,spec}.{ts,js}',
      ],
      thresholds: {
        autoUpdate: true,
        'packages/cli/**': {
          statements: 73.33,
          functions: 76.19,
          branches: 61.11,
          lines: 73.33,
        },
        'packages/errors/**': {
          statements: 100,
          functions: 100,
          branches: 92.59,
          lines: 100,
        },
        'packages/extension/**': {
          statements: 57.53,
          functions: 50.96,
          branches: 75.63,
          lines: 57.43,
        },
        'packages/kernel/**': {
          statements: 79.26,
          functions: 89.69,
          branches: 64.86,
          lines: 79.47,
        },
        'packages/shims/**': {
          statements: 0,
          functions: 0,
          branches: 0,
          lines: 0,
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
