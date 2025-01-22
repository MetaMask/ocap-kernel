import path from 'path';
import tsconfigPathsPlugin from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  optimizeDeps: {
    include: ['@vitest/coverage-istanbul', 'vitest-fetch-mock'],
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
        'scripts/create-package/package-template/**',
      ],
      thresholds: {
        autoUpdate: true,
        'packages/cli/**': {
          statements: 61.6,
          functions: 63.41,
          branches: 58.62,
          lines: 61.6,
        },
        'packages/errors/**': {
          statements: 100,
          functions: 100,
          branches: 92.59,
          lines: 100,
        },
        'packages/extension/**': {
          statements: 65.92,
          functions: 70.62,
          branches: 69.28,
          lines: 65.92,
        },
        'packages/kernel/**': {
          statements: 42.66,
          functions: 54.48,
          branches: 29.72,
          lines: 42.95,
        },
        'packages/nodejs/**': {
          statements: 14.67,
          functions: 24,
          branches: 23.52,
          lines: 14.67,
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
        'scripts/create-package/**': {
          statements: 100,
          functions: 100,
          branches: 100,
          lines: 100,
        },
      },
    },
  },
});