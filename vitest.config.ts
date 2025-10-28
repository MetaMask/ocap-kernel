import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tsconfigPathsPlugin from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  optimizeDeps: {
    exclude: ['@sqlite.org/sqlite-wasm'],
    include: ['@vitest/coverage-v8', 'vitest-fetch-mock', 'better-sqlite3'],
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
      provider: 'v8',
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
          statements: 48.61,
          functions: 91.3,
          branches: 92.42,
          lines: 48.61,
        },
        'packages/create-package/**': {
          statements: 99.66,
          functions: 100,
          branches: 98.3,
          lines: 99.66,
        },
        'packages/extension/**': {
          statements: 3.62,
          functions: 0,
          branches: 0,
          lines: 3.62,
        },
        'packages/kernel-agents/**': {
          statements: 0,
          functions: 0,
          branches: 0,
          lines: 0,
        },
        'packages/kernel-browser-runtime/**': {
          statements: 77.04,
          functions: 81.66,
          branches: 93.87,
          lines: 77.04,
        },
        'packages/kernel-errors/**': {
          statements: 100,
          functions: 100,
          branches: 100,
          lines: 100,
        },
        'packages/kernel-language-model-service/**': {
          statements: 0,
          functions: 0,
          branches: 0,
          lines: 0,
        },
        'packages/kernel-platforms/**': {
          statements: 99.38,
          functions: 100,
          branches: 96.2,
          lines: 99.38,
        },
        'packages/kernel-rpc-methods/**': {
          statements: 0,
          functions: 0,
          branches: 0,
          lines: 0,
        },
        'packages/kernel-shims/**': {
          statements: 0,
          functions: 0,
          branches: 0,
          lines: 0,
        },
        'packages/kernel-store/**': {
          statements: 98.45,
          functions: 100,
          branches: 91.74,
          lines: 98.45,
        },
        'packages/kernel-ui/**': {
          statements: 97.57,
          functions: 97.29,
          branches: 93.26,
          lines: 97.57,
        },
        'packages/kernel-utils/**': {
          statements: 0,
          functions: 0,
          branches: 0,
          lines: 0,
        },
        'packages/logger/**': {
          statements: 100,
          functions: 100,
          branches: 96.49,
          lines: 100,
        },
        'packages/nodejs/**': {
          statements: 76.38,
          functions: 69.23,
          branches: 95.45,
          lines: 76.38,
        },
        'packages/nodejs-test-workers/**': {
          statements: 22.22,
          functions: 50,
          branches: 33.33,
          lines: 22.22,
        },
        'packages/ocap-kernel/**': {
          statements: 95.92,
          functions: 97.86,
          branches: 95.87,
          lines: 95.92,
        },
        'packages/omnium-gatherum/**': {
          statements: 5.67,
          functions: 20,
          branches: 20,
          lines: 5.67,
        },
        'packages/remote-iterables/**': {
          statements: 0,
          functions: 0,
          branches: 0,
          lines: 0,
        },
        'packages/streams/**': {
          statements: 100,
          functions: 100,
          branches: 99.67,
          lines: 100,
        },
        'packages/template-package/**': {
          statements: 0,
          functions: 0,
          branches: 100,
          lines: 0,
        },
      },
    },
  },
});
