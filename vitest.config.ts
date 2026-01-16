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
    clearMocks: true,
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
          import.meta.dirname,
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
        path.join(import.meta.dirname, './packages/brow-2-brow/**'),
      ],
      thresholds: {
        autoUpdate: true,
        'packages/cli/**': {
          statements: 52.32,
          functions: 53.57,
          branches: 68.88,
          lines: 52.63,
        },
        'packages/create-package/**': {
          statements: 100,
          functions: 100,
          branches: 100,
          lines: 100,
        },
        'packages/extension/**': {
          statements: 1.35,
          functions: 0,
          branches: 0,
          lines: 1.36,
        },
        'packages/kernel-agents/**': {
          statements: 88.16,
          functions: 80,
          branches: 75.38,
          lines: 88.13,
        },
        'packages/kernel-browser-runtime/**': {
          statements: 84.4,
          functions: 78.3,
          branches: 81.11,
          lines: 84.63,
        },
        'packages/kernel-errors/**': {
          statements: 99.24,
          functions: 97.29,
          branches: 96,
          lines: 99.21,
        },
        'packages/kernel-language-model-service/**': {
          statements: 99,
          functions: 100,
          branches: 94.11,
          lines: 98.97,
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
          statements: 98.37,
          functions: 100,
          branches: 91.42,
          lines: 98.36,
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
          statements: 98.66,
          functions: 96.66,
          branches: 97.36,
          lines: 100,
        },
        'packages/nodejs/**': {
          statements: 88.88,
          functions: 87.5,
          branches: 90.9,
          lines: 89.65,
        },
        'packages/nodejs-test-workers/**': {
          statements: 23.52,
          functions: 25,
          branches: 25,
          lines: 25,
        },
        'packages/ocap-kernel/**': {
          statements: 95.44,
          functions: 98.06,
          branches: 87.65,
          lines: 95.42,
        },
        'packages/omnium-gatherum/**': {
          statements: 4.34,
          functions: 4.76,
          branches: 0,
          lines: 4.41,
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
