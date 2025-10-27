import { describe, it, expect, beforeEach, vi } from 'vitest';

import { getBaseMethods } from './base.ts';
import { getRemoteMethods } from './remote.ts';
import type { RemoteId, RemoteInfo } from '../../types.ts';
import type { StoreContext } from '../types.ts';

vi.mock('./base.ts', () => ({
  getBaseMethods: vi.fn(),
}));

describe('remote store methods', () => {
  let mockKV: Map<string, string>;
  const remoteId1 = 'r1' as RemoteId;
  const remoteId2 = 'r2' as RemoteId;
  const mockGetPrefixedKeys = vi.fn();
  let context: StoreContext;
  let remoteMethods: ReturnType<typeof getRemoteMethods>;
  const remoteInfo1: RemoteInfo = {
    peerId: 'peer1',
    hints: ['hintA', 'hintB'],
  };
  const remoteInfo2: RemoteInfo = {
    peerId: 'peer2',
    hints: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockKV = new Map();

    (getBaseMethods as ReturnType<typeof vi.fn>).mockReturnValue({
      getPrefixedKeys: mockGetPrefixedKeys,
    });

    context = {
      kv: {
        get: (key: string): string | undefined => mockKV.get(key),
        getRequired: (key: string): string => {
          const value = mockKV.get(key);
          if (value === undefined) {
            throw new Error(`Required key ${key} not found`);
          }
          return value;
        },
        set: (key: string, value: string): void => {
          mockKV.set(key, value);
        },
        delete: (key: string): void => {
          mockKV.delete(key);
        },
      },
    } as unknown as StoreContext;

    remoteMethods = getRemoteMethods(context);
  });

  describe('getRemoteInfo', () => {
    it('retrieves remote info from storage', () => {
      mockKV.set(`remote.${remoteId1}`, JSON.stringify(remoteInfo1));

      const result = remoteMethods.getRemoteInfo(remoteId1);

      expect(result).toStrictEqual(remoteInfo1);
    });

    it('throws error if remote info does not exist', () => {
      expect(() => remoteMethods.getRemoteInfo(remoteId1)).toThrow(
        'Required key remote.r1 not found',
      );
    });
  });

  describe('setRemoteInfo', () => {
    it('stores remote info in storage', () => {
      remoteMethods.setRemoteInfo(remoteId1, remoteInfo1);

      const storedInfo = JSON.parse(
        mockKV.get(`remote.${remoteId1}`) as string,
      );
      expect(storedInfo).toStrictEqual(remoteInfo1);
    });

    it('overwrites existing remote info', () => {
      mockKV.set(`remote.${remoteId1}`, JSON.stringify(remoteInfo1));

      const updatedInfo = {
        ...remoteInfo1,
        name: 'updated-remote',
      } as unknown as RemoteInfo;

      remoteMethods.setRemoteInfo(remoteId1, updatedInfo);

      const storedInfo = JSON.parse(
        mockKV.get(`remote.${remoteId1}`) as string,
      );
      expect(storedInfo).toStrictEqual(updatedInfo);
    });
  });

  describe('deleteRemoteInfo', () => {
    it('removes remote info from storage', () => {
      mockKV.set(`remote.${remoteId1}`, JSON.stringify(remoteInfo1));

      remoteMethods.deleteRemoteInfo(remoteId1);

      expect(mockKV.has(`remote.${remoteId1}`)).toBe(false);
    });

    it('does nothing if remote info does not exist', () => {
      expect(() => remoteMethods.deleteRemoteInfo(remoteId1)).not.toThrow();
    });
  });

  describe('getAllRemoteRecords', () => {
    it('yields all stored remote records', () => {
      mockKV.set(`remote.${remoteId1}`, JSON.stringify(remoteInfo1));
      mockKV.set(`remote.${remoteId2}`, JSON.stringify(remoteInfo2));

      mockGetPrefixedKeys.mockReturnValue([
        `remote.${remoteId1}`,
        `remote.${remoteId2}`,
      ]);

      const records = Array.from(remoteMethods.getAllRemoteRecords());

      expect(records).toStrictEqual([
        { remoteId: remoteId1, remoteInfo: remoteInfo1 },
        { remoteId: remoteId2, remoteInfo: remoteInfo2 },
      ]);
      expect(mockGetPrefixedKeys).toHaveBeenCalledWith('remote.');
    });

    it('yields an empty array when no remotes are extant', () => {
      mockGetPrefixedKeys.mockReturnValue([]);

      const records = Array.from(remoteMethods.getAllRemoteRecords());

      expect(records).toStrictEqual([]);
    });
  });
});
