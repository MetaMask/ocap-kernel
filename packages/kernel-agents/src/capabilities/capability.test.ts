import { describe, it, expect } from 'vitest';

import { capability } from './capability.ts';

describe('capability', () => {
  it('creates a capability with func and schema', () => {
    const testCapability = capability(async () => Promise.resolve('test'), {
      description: 'a test capability',
      args: {},
    });
    expect(testCapability.func).toBeInstanceOf(Function);
    expect(testCapability.schema).toStrictEqual({
      description: 'a test capability',
      args: {},
    });
  });
});
