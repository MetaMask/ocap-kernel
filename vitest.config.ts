import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const endoifySourcePath = path.join(
  import.meta.dirname,
  './packages/kernel-shims/src/endoify.js',
);

export default defineConfig({
  optimizeDeps: {
    exclude: ['@sqlite.org/sqlite-wasm'],
    include: ['@vitest/coverage-v8', 'vitest-fetch-mock', 'better-sqlite3'],
  },

  plugins: [
    // Redirect @metamask/kernel-shims/endoify to the source file and mark it
    // external so it is not bundled into the test runner.
    {
      name: 'kernel-shims-endoify-resolver',
      enforce: 'pre',
      resolveId(id) {
        if (id === '@metamask/kernel-shims/endoify') {
          return { id: endoifySourcePath, external: true };
        }
        return undefined;
      },
    },
  ],

  resolve: {
    // Resolve imports using the "paths" property of the relevant tsconfig.json.
    tsconfigPaths: true,
  },

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
    coverage: {
      enabled: true,
      provider: 'v8',
      reporter: ['json', 'json-summary', 'html'],
      reportsDirectory: './coverage',
      include: ['**/src/**/*.{ts,tsx}'],
      exclude: [
        '**/coverage/**',
        '**/dist/**',
        '**/test/**',
        '**/node_modules/**',
        '**/*.{test,spec}.{ts,tsx,js,jsx}',
      ],
    },
  },
});
