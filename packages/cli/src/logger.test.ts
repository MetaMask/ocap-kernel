import { describe, it, expect } from 'vitest';

describe('logger', () => {
  it('exports a logger', async () => {
    const { logger } = await import('./logger.ts');
    expect(logger).toBeDefined();
    expect(logger.label).toMatch(/cli/u);
  });
});
