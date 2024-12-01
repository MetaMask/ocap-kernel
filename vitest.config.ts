import tsconfigPathsPlugin from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    // Resolve imports using the "paths" property of the relevant tsconfig.json,
    // if possible.
    tsconfigPathsPlugin(),
  ],

  optimizeDeps: {
    include: ['@vitest/coverage-istanbul'],
  },

  test: {
    environment: 'node',
    pool: 'threads',
    silent: true,
    testTimeout: 2000,
    restoreMocks: true,
    reporters: ['basic'],
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
        'packages/errors/**': {
          lines: 100,
          functions: 100,
          branches: 92.59,
          statements: 100,
        },
        'packages/extension/**': {
          lines: 47.65,
          functions: 40.33,
          branches: 66.92,
          statements: 47.45,
        },
        'packages/kernel/**': {
          lines: 88.72,
          functions: 92.43,
          branches: 80,
          statements: 88.54,
        },
        'packages/shims/**': {
          lines: 0,
          functions: 0,
          branches: 0,
          statements: 0,
        },
        'packages/streams/**': {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
        'packages/utils/**': {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
      },
    },
  },
});
