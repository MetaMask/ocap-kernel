import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'evm-wallet:docker-e2e',
    // docker-e2e.test.ts runs bundler-7702, bundler-hybrid, and peer-relay by default
    // (set DELEGATION_MODE to run a single mode).
    pool: 'forks',
    include: ['./test/e2e/docker/**/*.test.ts'],
    hookTimeout: 120_000,
    // Hybrid UserOp path waits up to 120s for bundler inclusion after sendTransaction.
    testTimeout: 180_000,
    // No setupFiles — we need real fetch (not mocked) and no lockdown shims.
    setupFiles: [],
  },
});
