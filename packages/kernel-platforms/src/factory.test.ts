import { describe, expect, it, vi } from 'vitest';

import { makePlatformFactory } from './factory.ts';
import type { PlatformConfig } from './types.ts';

describe('makePlatformFactory', () => {
  const createMockFactories = () => ({
    fetch: vi.fn().mockReturnValue({ request: vi.fn() }),
    fs: vi.fn().mockReturnValue({ readFile: vi.fn() }),
  });

  it('creates platform factory', () => {
    const mockFactories = createMockFactories();
    const platformFactory = makePlatformFactory(mockFactories);
    expect(typeof platformFactory).toBe('function');
  });

  it.each([
    {
      name: 'single capability',
      config: { fetch: {} },
      expectedCapabilities: ['fetch'],
      expectedOptions: {},
    },
    {
      name: 'multiple capabilities',
      config: { fetch: {}, fs: { rootDir: '/tmp' } },
      expectedCapabilities: ['fetch', 'fs'],
      expectedOptions: {},
    },
    {
      name: 'with options',
      config: { fetch: {} },
      expectedCapabilities: ['fetch'],
      expectedOptions: { fetch: { timeout: 5000 } },
    },
  ])(
    'creates platform with $name',
    async ({ config, expectedCapabilities, expectedOptions }) => {
      const mockFactories = createMockFactories();
      const platformFactory = makePlatformFactory(mockFactories);

      const platform = await platformFactory(config, expectedOptions as never);

      expectedCapabilities.forEach((capability) => {
        expect(platform[capability as keyof typeof platform]).toBeDefined();
        expect(
          mockFactories[capability as keyof typeof mockFactories],
        ).toHaveBeenCalledWith(
          config[capability as keyof typeof config],
          expectedOptions[capability as keyof typeof expectedOptions] ?? {},
        );
      });
    },
  );

  it('creates platform with partial config', async () => {
    const mockFactories = createMockFactories();
    const platformFactory = makePlatformFactory(mockFactories);
    const config = { fetch: {} };

    const platform = await platformFactory(config);

    expect(platform.fetch).toBeDefined();
    expect(platform.fs).toBeUndefined();
  });

  it.each([
    {
      name: 'unregistered capability',
      factories: { fetch: vi.fn() },
      config: { fetch: {}, unknown: {} } as Partial<PlatformConfig>,
      expectedError:
        'Config provided entry for unregistered capability: unknown',
    },
    {
      name: 'missing factory',
      factories: { fetch: vi.fn() },
      config: { fetch: {}, fs: { rootDir: '/tmp' } },
      expectedError: 'Config provided entry for unregistered capability: fs',
    },
  ])('throws error for $name', async ({ factories, config, expectedError }) => {
    const platformFactory = makePlatformFactory(factories);
    await expect(platformFactory(config)).rejects.toThrow(expectedError);
  });
});
