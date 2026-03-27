import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'evm-wallet:docker-e2e',
    pool: 'forks',
    include: ['./test/e2e/docker/**/*.test.ts'],
    hookTimeout: 120_000,
    testTimeout: 120_000,
    // No setupFiles — we need real fetch (not mocked) and no lockdown shims.
    setupFiles: [],
  },
});
