import { describe, expect, it } from 'vitest';

import { fsConfigStruct } from './types.ts';
import type { FsConfig } from './types.ts';
import { superstructValidationError } from '../../../test/utils.ts';

describe('fs types', () => {
  describe('fsConfigStruct', () => {
    it.each([
      { name: 'minimal config with rootDir', config: { rootDir: '/root' } },
      {
        name: 'config with rootDir and readFile enabled',
        config: { rootDir: '/root', readFile: true },
      },
      {
        name: 'config with rootDir and writeFile enabled',
        config: { rootDir: '/root', writeFile: true },
      },
      {
        name: 'config with rootDir and readdir enabled',
        config: { rootDir: '/root', readdir: true },
      },
      {
        name: 'config with all operations enabled',
        config: {
          rootDir: '/root',
          readFile: true,
          writeFile: true,
          readdir: true,
        },
      },
      {
        name: 'config with some operations disabled',
        config: {
          rootDir: '/root',
          readFile: false,
          writeFile: true,
          readdir: false,
        },
      },
      { name: 'config with empty string rootDir', config: { rootDir: '' } },
    ])('validates $name', ({ config }) => {
      expect(() => fsConfigStruct.create(config)).not.toThrow();
    });

    it.each([
      { name: 'config without rootDir', config: {} },
      { name: 'config with non-string rootDir', config: { rootDir: 123 } },
      {
        name: 'config with non-boolean readFile',
        config: { rootDir: '/root', readFile: 'true' },
      },
      {
        name: 'config with non-boolean writeFile',
        config: { rootDir: '/root', writeFile: 'true' },
      },
      {
        name: 'config with non-boolean readdir',
        config: { rootDir: '/root', readdir: 'true' },
      },
      {
        name: 'config with additional properties',
        config: { rootDir: '/root', extraProp: 'value' },
      },
    ])('rejects $name', ({ config }) => {
      expect(() => fsConfigStruct.create(config)).toThrow(
        superstructValidationError,
      );
    });

    it('allows undefined properties', () => {
      const config: FsConfig = { rootDir: '/root' };
      const validated = fsConfigStruct.create(config);

      expect(validated.rootDir).toBe('/root');
      expect(validated.readFile).toBeUndefined();
      expect(validated.writeFile).toBeUndefined();
      expect(validated.readdir).toBeUndefined();
    });

    it('preserves boolean values', () => {
      const config: FsConfig = {
        rootDir: '/root',
        readFile: true,
        writeFile: false,
        readdir: true,
      };
      const validated = fsConfigStruct.create(config);

      expect(validated.rootDir).toBe('/root');
      expect(validated.readFile).toBe(true);
      expect(validated.writeFile).toBe(false);
      expect(validated.readdir).toBe(true);
    });
  });
});
