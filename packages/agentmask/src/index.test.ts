import { describe, expect, it } from 'vitest';

describe('agentmask', () => {
  it('has an entry point', async () => {
    const mod = await import('./index.ts');
    expect(mod).toBeDefined();
  });
});
