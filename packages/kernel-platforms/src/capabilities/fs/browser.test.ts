import { describe, expect, it } from 'vitest';

import { capabilityFactory } from './browser.ts';
import type { FsConfig } from './types.ts';

describe('fs browser capability', () => {
  describe('capabilityFactory', () => {
    it.each([
      { name: 'readFile', config: { rootDir: '/root', readFile: true } },
      { name: 'writeFile', config: { rootDir: '/root', writeFile: true } },
      { name: 'readdir', config: { rootDir: '/root', readdir: true } },
      {
        name: 'all operations',
        config: {
          rootDir: '/root',
          readFile: true,
          writeFile: true,
          readdir: true,
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

      expect(capability).not.toHaveProperty('readFile');
      expect(capability).not.toHaveProperty('writeFile');
      expect(capability).not.toHaveProperty('readdir');
    });
  });
});
