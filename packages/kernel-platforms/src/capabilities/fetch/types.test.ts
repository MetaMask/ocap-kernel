import { describe, expect, it } from 'vitest';

import { fetchConfigStruct } from './types.ts';
import type { FetchConfig } from './types.ts';
import { superstructValidationError } from '../../../test/utils.ts';

describe('fetch types', () => {
  describe('fetchConfigStruct', () => {
    it.each([
      { name: 'empty config', config: {} },
      {
        name: 'config with single allowed host',
        config: { allowedHosts: ['example.test'] },
      },
      {
        name: 'config with multiple allowed hosts',
        config: {
          allowedHosts: ['example.test', 'api.github.com', 'localhost'],
        },
      },
      {
        name: 'config with empty allowed hosts array',
        config: { allowedHosts: [] },
      },
      {
        name: 'config with various host formats',
        config: {
          allowedHosts: [
            'example.test',
            'api.example.test',
            'localhost',
            '127.0.0.1',
            'subdomain.example.org',
          ],
        },
      },
    ])('validates $name', ({ config }) => {
      expect(() => fetchConfigStruct.create(config)).not.toThrow();
    });

    it.each([
      {
        name: 'non-array allowed hosts',
        config: { allowedHosts: 'example.test' },
      },
      {
        name: 'non-string host in array',
        config: { allowedHosts: ['example.test', 123, 'api.github.com'] },
      },
      {
        name: 'null host in array',
        config: { allowedHosts: ['example.test', null, 'api.github.com'] },
      },
      {
        name: 'undefined host in array',
        config: { allowedHosts: ['example.test', undefined, 'api.github.com'] },
      },
      {
        name: 'additional properties',
        config: { allowedHosts: ['example.test'], extraProp: 'value' },
      },
    ])('rejects $name', ({ config }) => {
      expect(() => fetchConfigStruct.create(config)).toThrow(
        superstructValidationError,
      );
    });

    it('allows empty host', () => {
      const config = { allowedHosts: ['example.test', '', 'api.github.com'] };
      expect(() => fetchConfigStruct.create(config)).not.toThrow();
    });

    it('preserves config values', () => {
      const config: FetchConfig = {
        allowedHosts: ['example.test', 'api.github.com'],
      };
      const validated = fetchConfigStruct.create(config);

      expect(validated.allowedHosts).toStrictEqual([
        'example.test',
        'api.github.com',
      ]);
    });

    it('allows undefined hosts', () => {
      const config: FetchConfig = {};
      const validated = fetchConfigStruct.create(config);

      expect(validated.allowedHosts).toBeUndefined();
    });
  });
});
