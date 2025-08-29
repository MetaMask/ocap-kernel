import { describe, expect, it } from 'vitest';

import { platformConfigStruct } from './index.ts';
import type { CapabilityName, Capability, CapabilityConfig } from './index.ts';

describe('kernel-platforms index', () => {
  it('exports platformConfigStruct', () => {
    expect(platformConfigStruct).toBeDefined();
    expect(typeof platformConfigStruct.create).toBe('function');
  });

  it('exports type definitions', () => {
    // Test that types are properly exported by using them
    const capabilityName: CapabilityName = 'fetch';
    expect(capabilityName).toBe('fetch');

    // Test that we can use the generic types
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    type TestCapability = Capability<'fetch'>;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    type TestConfig = CapabilityConfig<'fetch'>;

    // This test passes if TypeScript compilation succeeds
    expect(true).toBe(true);
  });
});
