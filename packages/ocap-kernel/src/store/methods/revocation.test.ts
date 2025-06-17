import type { KVStore } from '@metamask/kernel-store';
import { describe, it, expect, beforeEach } from 'vitest';

import { getObjectMethods } from './object.ts';
import { makeMapKVStore } from '../../../test/storage.ts';
import type { StoreContext } from '../types.ts';
import { getRevocationMethods } from './revocation.ts';

describe('revocation-methods', () => {
  let kv: KVStore;
  let objectStore: ReturnType<typeof getObjectMethods>;
  let nextObjectId: { get: () => string; set: (value: string) => void };
  let revocation: ReturnType<typeof getRevocationMethods>;

  beforeEach(() => {
    kv = makeMapKVStore();
    // Initialize nextObjectId counter
    kv.set('nextObjectId', '0');
    nextObjectId = {
      get: () => kv.get('nextObjectId') ?? '0',
      set: (value: string) => kv.set('nextObjectId', value),
    };

    objectStore = getObjectMethods({
      kv,
      nextObjectId,
    } as StoreContext);

    revocation = getRevocationMethods({
      kv,
      nextObjectId,
    } as StoreContext);
  });

  describe('revokeKernelObject', () => {
    it('revokes a kernel object', () => {
      const koId = objectStore.initKernelObject('v1');
      revocation.revoke(koId);
      expect(revocation.isRevoked(koId)).toBe(true);
    });

    it('does not change the reference counts', () => {
      const koId = objectStore.initKernelObject('v1');
      objectStore.setObjectRefCount(koId, { reachable: 1, recognizable: 1 });
      revocation.revoke(koId);
      expect(objectStore.getObjectRefCount(koId)).toStrictEqual({
        reachable: 1,
        recognizable: 1,
      });
    });

    it('throws when trying to revoke a promise', () => {
      const koId = 'kp1';
      expect(() => revocation.revoke(koId)).toThrow(
        `cannot revoke promise ${koId}`,
      );
    });
  });

  describe('isRevoked', () => {
    it('returns true if the object is revoked', () => {
      const koId = objectStore.initKernelObject('v1');
      revocation.revoke(koId);
      expect(revocation.isRevoked(koId)).toBe(true);
    });

    it('returns false if the object is not revoked', () => {
      const koId = objectStore.initKernelObject('v1');
      expect(revocation.isRevoked(koId)).toBe(false);
    });

    it('throws if the object is unknown and throwIfUnknown is true', () => {
      const koId = 'ko1';
      expect(() => revocation.isRevoked(koId)).toThrow(
        `cannot check revocation status of unknown object "${koId}"`,
      );
    });

    it('returns false if the object is unknown and throwIfUnknown is false', () => {
      const koId = 'ko1';
      expect(revocation.isRevoked(koId, false)).toBe(false);
    });

    it('throws if the revoked flag is invalid', () => {
      const koId = 'ko1';
      kv.set(`${koId}.revoked`, 'invalid');
      expect(() => revocation.isRevoked(koId)).toThrow(
        `invalid revoked flag for object ${koId}: invalid`,
      );
    });
  });
});
