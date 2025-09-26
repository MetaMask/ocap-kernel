import { fileURLToPath } from 'node:url';
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
      fileURLToPath(
        import.meta.resolve('@ocap/repo-tools/test-utils/fetch-mock'),
      ),
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
          statements: 52.32,
          functions: 52.63,
          branches: 72.09,
          lines: 52.32,
        },
        'packages/create-package/**': {
          statements: 100,
          functions: 100,
          branches: 100,
          lines: 100,
        },
        'packages/extension/**': {
          statements: 1.92,
          functions: 0,
          branches: 0,
          lines: 1.92,
        },
        'packages/kernel-browser-runtime/**': {
          statements: 72.3,
          functions: 69.56,
          branches: 58.2,
          lines: 72.3,
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
          statements: 95.03,
          functions: 95.83,
          branches: 87.53,
          lines: 95.11,
        },
        'packages/kernel-utils/**': {
          statements: 100,
          functions: 100,
          branches: 100,
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
          statements: 88.54,
          functions: 89.83,
          branches: 80.27,
          lines: 88.6,
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
