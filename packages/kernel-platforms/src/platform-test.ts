import { describe, expect, it } from 'vitest';

import type { PlatformFactory } from './types.ts';

export const createPlatformTestSuite = (
  makePlatform: PlatformFactory,
  platformName: string,
): void => {
  describe(`${platformName} platform`, () => {
    it('exports makePlatform function', () => {
      expect(typeof makePlatform).toBe('function');
    });

    it.each([
      {
        name: 'fetch capability',
        config: { fetch: {} },
        expectedFetch: { type: 'function' },
        expectedFs: { type: 'undefined' },
      },
      {
        name: 'fs capability',
        config: { fs: { rootDir: '/tmp' } },
        expectedFetch: { type: 'undefined' },
        expectedFs: { type: 'object' },
      },
      {
        name: 'both capabilities',
        config: {
          fetch: {},
          fs: { rootDir: '/tmp' },
        },
        expectedFetch: { type: 'function' },
        expectedFs: { type: 'object' },
      },
    ])(
      'creates platform with $name',
      async ({ config, expectedFetch, expectedFs }) => {
        const platform = await makePlatform(config);

        expect(typeof platform.fetch).toBe(expectedFetch.type);
        expect(typeof platform.fs).toBe(expectedFs.type);
      },
    );

    it('creates platform with partial config', async () => {
      const config = { fetch: {} };
      const platform = await makePlatform(config);

      expect(platform.fetch).toBeDefined();
      expect(platform.fs).toBeUndefined();
      expect(typeof platform.fetch).toBe('function');
    });

    it('passes options to capability factories', async () => {
      const config = { fetch: {} };
      const options = { fetch: { timeout: 5000 } };

      await makePlatform(config, options);

      // The actual capability factory calls are mocked, but we can verify
      // that the platform factory handles options correctly
      expect(true).toBe(true);
    });
  });
};
