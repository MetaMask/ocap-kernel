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
      reporter: ['text', 'json', 'json-summary', 'html'],
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
    },
  },
});
