import type { Logger } from '@metamask/logger';
import { describe, it, expect, vi } from 'vitest';

import { getLocationHintMethods } from './location-hints.ts';
import { makeMapKVStore } from '../../../test/storage.ts';

function makeCtx(loggerOverride?: Logger) {
  const kv = makeMapKVStore();
  const logger =
    loggerOverride ??
    ({
      log: vi.fn(),
      error: vi.fn(),
      subLogger: vi.fn(),
    } as unknown as Logger);
  return { kv, logger, methods: getLocationHintMethods({ kv, logger }) };
}

describe('getLocationHintMethods', () => {
  describe('getLocationHintEntries', () => {
    it('returns empty array when no location hints are stored', () => {
      const { methods } = makeCtx();
      expect(methods.getLocationHintEntries()).toStrictEqual([]);
    });

    it('stores and retrieves location-hint entries', () => {
      const { methods } = makeCtx();
      const entries = [
        { addr: 'hint1', lastSeen: 100, isBootstrap: true },
        { addr: 'hint2', lastSeen: 200, isBootstrap: false },
      ];
      methods.setLocationHintEntries(entries);
      expect(methods.getLocationHintEntries()).toStrictEqual(entries);
    });

    it('throws contextual error on corrupt JSON', () => {
      const { kv, methods } = makeCtx();
      kv.set('knownLocationHints', '{bad json');
      expect(() => methods.getLocationHintEntries()).toThrow(
        /Failed to parse knownLocationHints from store/u,
      );
    });

    it('throws when stored knownLocationHints is not a JSON array', () => {
      const { kv, methods } = makeCtx();
      kv.set('knownLocationHints', '"not-an-array"');
      expect(() => methods.getLocationHintEntries()).toThrow(
        'knownLocationHints must be an array',
      );
    });

    it('throws when location-hint entries have invalid shape', () => {
      const { kv, methods } = makeCtx();
      kv.set(
        'knownLocationHints',
        JSON.stringify([{ addr: 'ok', lastSeen: 'bad', isBootstrap: false }]),
      );
      expect(() => methods.getLocationHintEntries()).toThrow(
        /Invalid stored location-hint/u,
      );
    });

    it('returns empty array when stored value is an empty JSON array', () => {
      const { kv, methods } = makeCtx();
      kv.set('knownLocationHints', '[]');
      expect(methods.getLocationHintEntries()).toStrictEqual([]);
    });
  });

  describe('setLocationHintEntries', () => {
    it('validates entries on write', () => {
      const { methods } = makeCtx();
      expect(() =>
        methods.setLocationHintEntries([
          { addr: 123 as unknown as string, lastSeen: 0, isBootstrap: false },
        ]),
      ).toThrow(/Invalid location-hint entry/u);
    });

    it.each([
      ['empty addr', { addr: '', lastSeen: 0, isBootstrap: false }],
      [
        'negative lastSeen',
        { addr: 'hint1', lastSeen: -1, isBootstrap: false },
      ],
      ['NaN lastSeen', { addr: 'hint1', lastSeen: NaN, isBootstrap: false }],
      [
        'Infinity lastSeen',
        { addr: 'hint1', lastSeen: Infinity, isBootstrap: false },
      ],
    ])('rejects entry with %s', (_label, entry) => {
      const { methods } = makeCtx();
      expect(() => methods.setLocationHintEntries([entry])).toThrow(
        /Invalid location-hint entry/u,
      );
    });
  });

  describe('getKnownLocationHintAddresses', () => {
    it('returns only addresses from location-hint entries', () => {
      const { methods } = makeCtx();
      methods.setLocationHintEntries([
        { addr: 'hint1', lastSeen: 100, isBootstrap: true },
        { addr: 'hint2', lastSeen: 200, isBootstrap: false },
      ]);
      expect(methods.getKnownLocationHintAddresses()).toStrictEqual([
        'hint1',
        'hint2',
      ]);
    });

    it('returns empty array when no location hints stored', () => {
      const { methods } = makeCtx();
      expect(methods.getKnownLocationHintAddresses()).toStrictEqual([]);
    });
  });

  describe('remote identity values', () => {
    it('returns undefined for unset values', () => {
      const { methods } = makeCtx();
      expect(methods.getRemoteIdentityValue('peerId')).toBeUndefined();
    });

    it('stores and retrieves identity values', () => {
      const { methods } = makeCtx();
      methods.setRemoteIdentityValue('peerId', 'test-peer-id');
      expect(methods.getRemoteIdentityValue('peerId')).toBe('test-peer-id');
    });

    it('getRemoteIdentityValueRequired throws for missing values', () => {
      const { methods } = makeCtx();
      expect(() => methods.getRemoteIdentityValueRequired('peerId')).toThrow(
        /peerId/u,
      );
    });
  });
});
