import { describe, expect, it, vi } from 'vitest';

import { superstructValidationError } from '../test/utils.ts';
import { fetchConfigStruct } from './capabilities/fetch/types.ts';
import type { FetchConfig } from './capabilities/fetch/types.ts';
import { makeCapabilitySpecification } from './specification.ts';

describe('makeCapabilitySpecification', () => {
  it('creates specification with configStruct and capabilityFactory', () => {
    const mockCapabilityFactory = vi.fn();
    const specification = makeCapabilitySpecification(
      fetchConfigStruct,
      mockCapabilityFactory,
    );

    expect(specification).toHaveProperty('configStruct');
    expect(specification).toHaveProperty('capabilityFactory');
    expect(specification.configStruct).toBe(fetchConfigStruct);
    expect(specification.capabilityFactory).toBe(mockCapabilityFactory);
  });

  it('validates config using configStruct', () => {
    const mockCapabilityFactory = vi.fn();
    const specification = makeCapabilitySpecification(
      fetchConfigStruct,
      mockCapabilityFactory,
    );

    const validConfig: FetchConfig = { allowedHosts: ['example.test'] };
    expect(() => specification.configStruct.create(validConfig)).not.toThrow();
  });

  it('rejects invalid config using configStruct', () => {
    const mockCapabilityFactory = vi.fn();
    const specification = makeCapabilitySpecification(
      fetchConfigStruct,
      mockCapabilityFactory,
    );

    const invalidConfig = { allowedHosts: 'not-an-array' };
    expect(() => specification.configStruct.create(invalidConfig)).toThrow(
      superstructValidationError,
    );
  });

  it('calls capabilityFactory with config and options', () => {
    const mockCapabilityFactory = vi.fn().mockReturnValue('mock-capability');
    const specification = makeCapabilitySpecification(
      fetchConfigStruct,
      mockCapabilityFactory,
    );

    const config: FetchConfig = { allowedHosts: ['example.test'] };
    const options = { timeout: 5000 };

    const result = specification.capabilityFactory(config, options);

    expect(mockCapabilityFactory).toHaveBeenCalledWith(config, options);
    expect(result).toBe('mock-capability');
  });

  it('calls capabilityFactory with config only', () => {
    const mockCapabilityFactory = vi.fn().mockReturnValue('mock-capability');
    const specification = makeCapabilitySpecification(
      fetchConfigStruct,
      mockCapabilityFactory,
    );

    const config: FetchConfig = { allowedHosts: ['example.test'] };

    const result = specification.capabilityFactory(config);

    expect(mockCapabilityFactory).toHaveBeenCalledWith(config);
    expect(result).toBe('mock-capability');
  });
});
