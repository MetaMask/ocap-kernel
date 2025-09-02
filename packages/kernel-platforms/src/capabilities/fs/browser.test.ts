import { describe, expect, it } from 'vitest';

import { capabilityFactory } from './browser.ts';
import type { FsConfig } from './types.ts';

describe('fs browser capability', () => {
  describe('capabilityFactory', () => {
    it('existsSync returns false', () => {
      const config: FsConfig = { rootDir: '/root', existsSync: true };
      const capability = capabilityFactory(config);

      // eslint-disable-next-line n/no-sync
      expect(capability.existsSync?.('/path')).toBe(false);
    });

    it.each([
      {
        name: 'promises.readFile',
        config: { rootDir: '/root', promises: { readFile: true } },
      },
      {
        name: 'promises.access',
        config: { rootDir: '/root', promises: { access: true } },
      },
      {
        name: 'all operations',
        config: {
          rootDir: '/root',
          existsSync: true,
          promises: {
            readFile: true,
            access: true,
          },
        },
      },
    ])('throws not implemented error for $name', ({ config }) => {
      expect(() => capabilityFactory(config)).toThrow(
        /Capability .* is not implemented in the browser/u,
      );
    });

    it('creates capability with no operations', () => {
      const config: FsConfig = { rootDir: '/root' };
      const capability = capabilityFactory(config);

      expect(capability).not.toHaveProperty('existsSync');
      expect(capability).not.toHaveProperty('promises');
    });
  });
});
