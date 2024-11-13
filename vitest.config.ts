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
    environment: 'jsdom',
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
        100: true,
      },
    },
  },
});
