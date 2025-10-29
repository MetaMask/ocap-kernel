import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
          statements: 50.84,
          functions: 50.84,
          branches: 68.88,
          lines: 51.13,
        },
        'packages/create-package/**': {
          statements: 100,
          functions: 100,
          branches: 100,
          lines: 100,
        },
        'packages/extension/**': {
          statements: 1.78,
          functions: 0,
          branches: 0,
          lines: 1.78,
        },
        'packages/kernel-agents/**': {
          statements: 100,
          functions: 100,
          branches: 100,
          lines: 100,
        },
        'packages/kernel-browser-runtime/**': {
          statements: 79.44,
          functions: 72.46,
          branches: 66.19,
          lines: 79.44,
        },
        'packages/kernel-errors/**': {
          statements: 99,
          functions: 96.42,
          branches: 95,
          lines: 99,
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
          statements: 99.29,
          functions: 100,
          branches: 94.44,
          lines: 99.26,
        },
        'packages/logger/**': {
          statements: 98.5,
          functions: 96,
          branches: 97.29,
          lines: 100,
        },
        'packages/nodejs/**': {
          statements: 80.24,
          functions: 88.23,
          branches: 76,
          lines: 81.25,
        },
        'packages/nodejs-test-workers/**': {
          statements: 23.52,
          functions: 25,
          branches: 25,
          lines: 25,
        },
        'packages/ocap-kernel/**': {
          statements: 95.23,
          functions: 96.61,
          branches: 86.44,
          lines: 95.21,
        },
        'packages/omnium-gatherum/**': {
          statements: 5.26,
          functions: 5.55,
          branches: 0,
          lines: 5.26,
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
