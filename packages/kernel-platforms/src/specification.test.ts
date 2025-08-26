import { object, string, number } from '@metamask/superstruct';
import { describe, expect, it, vi } from 'vitest';

import { makeCapabilitySpecification } from './specification.ts';
import type { CapabilitySpecification } from './specification.ts';

describe('makeCapabilitySpecification', () => {
  const createTestStruct = () =>
    object({
      url: string(),
      timeout: number(),
    });

  const createTestFactory = () => vi.fn().mockReturnValue({ request: vi.fn() });

  it('creates a capability specification', () => {
    const configStruct = createTestStruct();
    const capabilityFactory = createTestFactory();

    const specification = makeCapabilitySpecification(
      configStruct,
      capabilityFactory,
    );

    expect(specification).toBeDefined();
    expect(specification.configStruct).toBe(configStruct);
    expect(specification.capabilityFactory).toBe(capabilityFactory);
  });

  it('creates capability using specification', () => {
    const configStruct = createTestStruct();
    const mockCapability = { request: vi.fn() };
    const capabilityFactory = vi.fn().mockReturnValue(mockCapability);

    const specification = makeCapabilitySpecification(
      configStruct,
      capabilityFactory,
    );
    const config = { url: 'https://example.com', timeout: 5000 };
    const capability = specification.capabilityFactory(config);

    expect(capability).toBe(mockCapability);
    expect(capabilityFactory).toHaveBeenCalledWith(config);
  });

  it('supports optional options parameter', () => {
    const configStruct = object({
      url: string(),
    });
    const capabilityFactory = vi.fn().mockReturnValue({ request: vi.fn() });

    const specification = makeCapabilitySpecification(
      configStruct,
      capabilityFactory,
    );
    const config = { url: 'https://example.com' };
    const options = { retries: 3 };

    specification.capabilityFactory(config, options);

    expect(capabilityFactory).toHaveBeenCalledWith(config, options);
  });

  it('validates config using specification', () => {
    const configStruct = object({
      url: string(),
      timeout: number(),
    });
    const capabilityFactory = createTestFactory();
    const specification = makeCapabilitySpecification(
      configStruct,
      capabilityFactory,
    );

    const validConfig = { url: 'https://example.com', timeout: 5000 };
    const invalidConfig = { url: 'https://example.com', timeout: 'invalid' };

    expect(() => specification.configStruct.create(validConfig)).not.toThrow();
    expect(() => specification.configStruct.create(invalidConfig)).toThrow(
      /At path: .* -- Expected .*, but received: .*/u,
    );
  });

  it('has correct type structure', () => {
    const configStruct = createTestStruct();
    const capabilityFactory = createTestFactory();

    const specification: CapabilitySpecification<
      typeof configStruct,
      ReturnType<typeof capabilityFactory>
    > = makeCapabilitySpecification(configStruct, capabilityFactory);

    expect(specification.configStruct).toBeDefined();
    expect(specification.capabilityFactory).toBeDefined();
    expect(typeof specification.capabilityFactory).toBe('function');
  });
});
