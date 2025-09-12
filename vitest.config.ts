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
        path.join(__dirname, './packages/brow-2-brow/**'),
      ],
      thresholds: {
        autoUpdate: true,
        'packages/cli/**': {
          statements: 69.76,
          functions: 68.18,
          branches: 88.57,
          lines: 69.76,
        },
        'packages/create-package/**': {
          statements: 100,
          functions: 100,
          branches: 100,
          lines: 100,
        },
        'packages/extension/**': {
          statements: 1.96,
          functions: 0,
          branches: 0,
          lines: 1.96,
        },
        'packages/kernel-browser-runtime/**': {
          statements: 70.99,
          functions: 67.69,
          branches: 54.23,
          lines: 70.99,
        },
        'packages/kernel-errors/**': {
          statements: 98.82,
          functions: 96,
          branches: 92,
          lines: 98.82,
        },
        'packages/kernel-language-model-service/**': {
          statements: 100,
          functions: 100,
          branches: 100,
          lines: 100,
        },
        'packages/kernel-platforms/**': {
          statements: 99.28,
          functions: 100,
          branches: 91.89,
          lines: 99.26,
        },
        'packages/kernel-rpc-methods/**': {
          statements: 100,
          functions: 100,
          branches: 100,
          lines: 100,
        },
        'packages/kernel-shims/**': {
          statements: 0,
          functions: 0,
          branches: 0,
          lines: 0,
        },
        'packages/kernel-store/**': {
          statements: 98.36,
          functions: 100,
          branches: 91.42,
          lines: 98.35,
        },
        'packages/kernel-ui/**': {
          statements: 94.76,
          functions: 95.65,
          branches: 87.11,
          lines: 94.84,
        },
        'packages/kernel-utils/**': {
          statements: 100,
          functions: 100,
          branches: 96.96,
          lines: 100,
        },
        'packages/logger/**': {
          statements: 98.46,
          functions: 96,
          branches: 97.14,
          lines: 100,
        },
        'packages/nodejs/**': {
          statements: 68.49,
          functions: 75,
          branches: 54.54,
          lines: 69.44,
        },
        'packages/nodejs-test-workers/**': {
          statements: 23.52,
          functions: 25,
          branches: 25,
          lines: 25,
        },
        'packages/ocap-kernel/**': {
          statements: 87.81,
          functions: 89.26,
          branches: 79.59,
          lines: 87.82,
        },
        'packages/remote-iterables/**': {
          statements: 100,
          functions: 100,
          branches: 100,
          lines: 100,
        },
        'packages/streams/**': {
          statements: 100,
          functions: 100,
          branches: 100,
          lines: 100,
        },
        'packages/template-package/**': {
          statements: 100,
          functions: 100,
          branches: 100,
          lines: 100,
        },
      },
    },
  },
});
