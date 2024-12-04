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
          statements: 100,
          functions: 100,
          branches: 92.59,
          lines: 100,
        },
        'packages/extension/**': {
          statements: 57,
          functions: 48.48,
          branches: 67.3,
          lines: 57.14,
        },
        'packages/kernel/**': {
          statements: 88.62,
          functions: 92.48,
          branches: 80.26,
          lines: 88.8,
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
