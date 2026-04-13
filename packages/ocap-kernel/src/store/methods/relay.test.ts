import type { Logger } from '@metamask/logger';
import { describe, it, expect, vi } from 'vitest';

import { getRelayMethods } from './relay.ts';
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
  return { kv, logger, methods: getRelayMethods({ kv, logger }) };
}

describe('getRelayMethods', () => {
  describe('getRelayEntries', () => {
    it('returns empty array when no relays are stored', () => {
      const { methods } = makeCtx();
      expect(methods.getRelayEntries()).toStrictEqual([]);
    });

    it('stores and retrieves relay entries', () => {
      const { methods } = makeCtx();
      const entries = [
        { addr: 'relay1', lastSeen: 100, isBootstrap: true },
        { addr: 'relay2', lastSeen: 200, isBootstrap: false },
      ];
      methods.setRelayEntries(entries);
      expect(methods.getRelayEntries()).toStrictEqual(entries);
    });

    it('auto-migrates legacy string[] format to RelayEntry[]', () => {
      const { kv, methods } = makeCtx();
      kv.set('knownRelays', JSON.stringify(['peer1', 'peer2']));
      const entries = methods.getRelayEntries();
      expect(entries).toStrictEqual([
        { addr: 'peer1', lastSeen: 0, isBootstrap: false },
        { addr: 'peer2', lastSeen: 0, isBootstrap: false },
      ]);
      // Migration should persist the new format
      const raw = kv.get('knownRelays');
      expect(JSON.parse(raw as string)).toStrictEqual(entries);
    });

    it('logs migration event when migrating legacy format', () => {
      const { kv, logger, methods } = makeCtx();
      kv.set('knownRelays', JSON.stringify(['peer1', 'peer2']));
      methods.getRelayEntries();
      expect(logger.log).toHaveBeenCalledWith(
        'Migrated 2 legacy relay entries to RelayEntry format',
      );
    });

    it('throws contextual error on corrupt JSON', () => {
      const { kv, methods } = makeCtx();
      kv.set('knownRelays', '{bad json');
      expect(() => methods.getRelayEntries()).toThrow(
        /Failed to parse knownRelays from store/u,
      );
    });

    it('throws when stored knownRelays is not a JSON array', () => {
      const { kv, methods } = makeCtx();
      kv.set('knownRelays', '"not-an-array"');
      expect(() => methods.getRelayEntries()).toThrow(
        'knownRelays must be an array',
      );
    });

    it('throws on mixed legacy format', () => {
      const { kv, methods } = makeCtx();
      kv.set(
        'knownRelays',
        JSON.stringify([
          'peer1',
          { addr: 'peer2', lastSeen: 0, isBootstrap: false },
        ]),
      );
      expect(() => methods.getRelayEntries()).toThrow(
        'knownRelays legacy format must be all strings',
      );
    });

    it('throws when relay entries have invalid shape', () => {
      const { kv, methods } = makeCtx();
      kv.set(
        'knownRelays',
        JSON.stringify([{ addr: 'ok', lastSeen: 'bad', isBootstrap: false }]),
      );
      expect(() => methods.getRelayEntries()).toThrow(
        'knownRelays entries must have addr, lastSeen, isBootstrap',
      );
    });
  });

  describe('setRelayEntries', () => {
    it('validates entries on write', () => {
      const { methods } = makeCtx();
      expect(() =>
        methods.setRelayEntries([
          { addr: 123 as unknown as string, lastSeen: 0, isBootstrap: false },
        ]),
      ).toThrow(/Invalid relay entry/u);
    });
  });

  describe('getKnownRelayAddresses', () => {
    it('returns only addresses from relay entries', () => {
      const { methods } = makeCtx();
      methods.setRelayEntries([
        { addr: 'relay1', lastSeen: 100, isBootstrap: true },
        { addr: 'relay2', lastSeen: 200, isBootstrap: false },
      ]);
      expect(methods.getKnownRelayAddresses()).toStrictEqual([
        'relay1',
        'relay2',
      ]);
    });

    it('returns empty array when no relays stored', () => {
      const { methods } = makeCtx();
      expect(methods.getKnownRelayAddresses()).toStrictEqual([]);
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
