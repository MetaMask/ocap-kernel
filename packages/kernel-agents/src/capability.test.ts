import { describe, it, expect } from 'vitest';

import { capability, invokeCapabilities } from './capability.ts';

describe('capability', () => {
  it('creates a capability', () => {
    const testCapability = capability(async () => Promise.resolve('test'), {
      description: 'a test capability',
      args: {},
    });
    expect(testCapability).toBeDefined();
    expect(testCapability.func).toBeDefined();
    expect(testCapability.schema).toBeDefined();
  });
});

describe('invokeCapabilities', () => {
  it("invokes the assistant's chosen capability", async () => {
    const testCapability = capability(async () => Promise.resolve('test'), {
      description: 'a test capability',
      args: {},
    });
    const result = await invokeCapabilities(
      [{ name: 'testCapability', args: {} }],
      { testCapability },
    );
    expect(result).toStrictEqual([
      { name: 'testCapability', args: {}, result: 'test' },
    ]);
  });

  it('throws if the capability is not found', async () => {
    await expect(
      invokeCapabilities([{ name: 'testCapability', args: {} }], {}),
    ).rejects.toThrow('Invoked capability testCapability not found');
  });
});
