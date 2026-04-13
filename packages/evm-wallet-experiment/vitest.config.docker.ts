import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'evm-wallet:docker-e2e',
    // docker-e2e.test.ts runs bundler-7702, bundler-hybrid, and peer-relay by default
    // (set DELEGATION_MODE to run a single mode). Stack `yarn docker:up` enables all
    // kernel pair profiles; Docker Compose v2.38+ and Docker Model Runner are required
    // for Compose `models:` on away kernels.
    pool: 'forks',
    include: ['./test/e2e/docker/**/*.test.ts'],
    hookTimeout: 120_000,
    // Hybrid UserOp path waits up to 120s for bundler inclusion after sendTransaction.
    testTimeout: 180_000,
    // No setupFiles — we need real fetch (not mocked) and no lockdown shims.
    setupFiles: [],
    // Write structured results to logs/ so agents and CI can inspect failures
    // without parsing terminal output. Kernel service logs land alongside in
    // logs/<service-name>.log via the entrypoint tee.
    reporters: ['default', 'json'],
    outputFile: 'logs/test-results.json',
  },
});
