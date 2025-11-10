import { describe, it, expect } from 'vitest';

import { capability } from './capability.ts';

describe('capability', () => {
  it('creates a capability', () => {
    const testCapability = capability(async () => Promise.resolve('test'), {
      description: 'a test capability',
      args: {},
    });
    expect(testCapability).toStrictEqual({
      func: expect.any(Function),
      schema: { description: 'a test capability', args: {} },
    });
  });
});
