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
          statements: 0,
          functions: 0,
          branches: 0,
          lines: 0,
        },
        'packages/create-package/**': {
          statements: 0,
          functions: 0,
          branches: 0,
          lines: 0,
        },
        'packages/extension/**': {
          statements: 0,
          functions: 0,
          branches: 0,
          lines: 0,
        },
        'packages/kernel-agents/**': {
          statements: 0,
          functions: 0,
          branches: 0,
          lines: 0,
        },
        'packages/kernel-browser-runtime/**': {
          statements: 0,
          functions: 0,
          branches: 0,
          lines: 0,
        },
        'packages/kernel-errors/**': {
          statements: 0,
          functions: 0,
          branches: 0,
          lines: 0,
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
          statements: 0,
          functions: 0,
          branches: 0,
          lines: 0,
        },
        'packages/kernel-ui/**': {
          statements: 97.57,
          functions: 97.29,
          branches: 93.25,
          lines: 97.57,
        },
        'packages/kernel-utils/**': {
          statements: 100,
          functions: 100,
          branches: 100,
          lines: 100,
        },
        'packages/logger/**': {
          statements: 100,
          functions: 100,
          branches: 96.49,
          lines: 100,
        },
        'packages/nodejs/**': {
          statements: 87.77,
          functions: 85.71,
          branches: 96.77,
          lines: 87.77,
        },
        'packages/nodejs-test-workers/**': {
          statements: 0,
          functions: 0,
          branches: 0,
          lines: 0,
        },
        'packages/ocap-kernel/**': {
          statements: 96.52,
          functions: 98.28,
          branches: 95.92,
          lines: 96.52,
        },
        'packages/omnium-gatherum/**': {
          statements: 0,
          functions: 0,
          branches: 0,
          lines: 0,
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
          branches: 0,
          lines: 0,
        },
      },
    },
  },
});
