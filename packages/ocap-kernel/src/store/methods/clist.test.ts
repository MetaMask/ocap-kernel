import type { KVStore } from '@metamask/kernel-store';
import { describe, it, expect, beforeEach } from 'vitest';

import { getCListMethods } from './clist.ts';
import { makeMapKVStore } from '../../../test/storage.ts';
import type { EndpointId, KRef, ERef } from '../../types.ts';
import type { StoreContext } from '../types.ts';

describe('clist-methods', () => {
  let kv: KVStore;
  let clistMethods: ReturnType<typeof getCListMethods>;

  beforeEach(() => {
    kv = makeMapKVStore();

    // Initialize endpoint counters
    kv.set('e.nextPromiseId.v1', '1');
    kv.set('e.nextObjectId.v1', '1');
    kv.set('e.nextPromiseId.r1', '1');
    kv.set('e.nextObjectId.r1', '1');

    // Create the store with mocked dependencies
    clistMethods = getCListMethods({
      kv,
      maybeFreeKrefs: new Set(),
    } as StoreContext);
  });

  describe('addCListEntry', () => {
    it('adds a bidirectional mapping between KRef and ERef', () => {
      const endpointId: EndpointId = 'v1';
      const kref: KRef = 'ko1';
      const eref: ERef = 'o-1';

      clistMethods.addCListEntry(endpointId, kref, eref);

      // Check that both mappings are stored
      expect(kv.get(`${endpointId}.c.${kref}`)).toBe(`R ${eref}`);
      expect(kv.get(`${endpointId}.c.${eref}`)).toBe(kref);
    });

    it('works with promise refs', () => {
      const endpointId: EndpointId = 'v1';
      const kref: KRef = 'kp1';
      const eref: ERef = 'p+2';

      clistMethods.addCListEntry(endpointId, kref, eref);

      expect(kv.get(`${endpointId}.c.${kref}`)).toBe(`R ${eref}`);
      expect(kv.get(`${endpointId}.c.${eref}`)).toBe(kref);
    });

    it('works with remote endpoints', () => {
      const endpointId: EndpointId = 'r1';
      const kref: KRef = 'ko2';
      const eref: ERef = 'ro+3';

      clistMethods.addCListEntry(endpointId, kref, eref);

      expect(kv.get(`${endpointId}.c.${kref}`)).toBe(`R ${eref}`);
      expect(kv.get(`${endpointId}.c.${eref}`)).toBe(kref);
    });
  });

  describe('hasCListEntry', () => {
    it('returns true for existing entries', () => {
      const endpointId: EndpointId = 'v1';
      const kref: KRef = 'ko1';
      const eref: ERef = 'o-1';

      clistMethods.addCListEntry(endpointId, kref, eref);

      expect(clistMethods.hasCListEntry(endpointId, kref)).toBe(true);
      expect(clistMethods.hasCListEntry(endpointId, eref)).toBe(true);
    });

    it('returns false for non-existent entries', () => {
      const endpointId: EndpointId = 'v1';

      expect(clistMethods.hasCListEntry(endpointId, 'ko99')).toBe(false);
      expect(clistMethods.hasCListEntry(endpointId, 'o-99')).toBe(false);
    });
  });

  describe('allocateErefForKref', () => {
    it('allocates a new object ERef for a KRef', () => {
      const endpointId: EndpointId = 'v1';
      const kref: KRef = 'ko1';

      const eref = clistMethods.allocateErefForKref(endpointId, kref);

      // Check the allocated ERef format
      expect(eref).toBe('o-1');

      // Check that the counter was incremented
      expect(kv.get(`e.nextObjectId.${endpointId}`)).toBe('2');

      // Check that the mapping was added
      expect(kv.get(`${endpointId}.c.${kref}`)).toBe(`R ${eref}`);
      expect(kv.get(`${endpointId}.c.${eref}`)).toBe(kref);
    });

    it('allocates a new promise ERef for a KRef', () => {
      const endpointId: EndpointId = 'v1';
      const kref: KRef = 'kp1';

      const eref = clistMethods.allocateErefForKref(endpointId, kref);

      // Check the allocated ERef format
      expect(eref).toBe('p-1');

      // Check that the counter was incremented
      expect(kv.get(`e.nextPromiseId.${endpointId}`)).toBe('2');

      // Check that the mapping was added
      expect(kv.get(`${endpointId}.c.${kref}`)).toBe(`R ${eref}`);
      expect(kv.get(`${endpointId}.c.${eref}`)).toBe(kref);
    });

    it('allocates ERefs with remote prefix for remote endpoints', () => {
      const endpointId: EndpointId = 'r1';
      const kref: KRef = 'ko1';

      const eref = clistMethods.allocateErefForKref(endpointId, kref);

      // Check the allocated ERef format (should have 'r' prefix)
      expect(eref).toBe('ro-1');

      // Check that the counter was incremented
      expect(kv.get(`e.nextObjectId.${endpointId}`)).toBe('2');
    });
  });

  describe('erefToKref and krefToEref', () => {
    it('converts between ERef and KRef', () => {
      const endpointId: EndpointId = 'v1';
      const kref: KRef = 'ko1';
      const eref: ERef = 'o-1';

      clistMethods.addCListEntry(endpointId, kref, eref);

      expect(clistMethods.erefToKref(endpointId, eref)).toBe(kref);
      expect(clistMethods.krefToEref(endpointId, kref)).toBe(eref);
    });

    it('returns undefined for non-existent mappings', () => {
      const endpointId: EndpointId = 'v1';

      expect(clistMethods.erefToKref(endpointId, 'o-99')).toBeUndefined();
      expect(clistMethods.krefToEref(endpointId, 'ko99')).toBeUndefined();
    });
  });

  describe('krefsToExistingErefs', () => {
    it('returns the ERefs for existing KRefs', () => {
      const endpointId: EndpointId = 'v1';
      const kref1: KRef = 'ko1';
      const kref2: KRef = 'ko2';
      const eref1: ERef = 'o-1';
      const eref2: ERef = 'o-2';

      clistMethods.addCListEntry(endpointId, kref1, eref1);
      clistMethods.addCListEntry(endpointId, kref2, eref2);

      expect(
        clistMethods.krefsToExistingErefs(endpointId, [kref1, kref2]),
      ).toStrictEqual([eref1, eref2]);
    });

    it('returns an empty array for non-existent KRefs', () => {
      const endpointId: EndpointId = 'v1';
      const kref: KRef = 'ko1';

      expect(
        clistMethods.krefsToExistingErefs(endpointId, [kref]),
      ).toStrictEqual([]);
    });

    it('returns an empty array for empty KRef array', () => {
      const endpointId: EndpointId = 'v1';

      expect(clistMethods.krefsToExistingErefs(endpointId, [])).toStrictEqual(
        [],
      );
    });
  });

  describe('forgetEref', () => {
    it('removes a c-list entry when ERef exists', () => {
      const endpointId: EndpointId = 'v1';
      const kref: KRef = 'ko1';
      const eref: ERef = 'o-1';
      clistMethods.addCListEntry(endpointId, kref, eref);
      expect(kv.get(`${endpointId}.c.${kref}`)).toBe(`R ${eref}`);
      expect(kv.get(`${endpointId}.c.${eref}`)).toBe(kref);
      clistMethods.forgetEref(endpointId, eref);
      expect(kv.get(`${endpointId}.c.${kref}`)).toBeUndefined();
      expect(kv.get(`${endpointId}.c.${eref}`)).toBeUndefined();
    });

    it('does nothing when ERef does not exist', () => {
      const endpointId: EndpointId = 'v1';
      const nonExistentEref: ERef = 'o-99';
      expect(() => {
        clistMethods.forgetEref(endpointId, nonExistentEref);
      }).not.toThrow();
      expect(kv.get(`${endpointId}.c.${nonExistentEref}`)).toBeUndefined();
    });
  });

  describe('forgetKref', () => {
    it('removes a c-list entry when KRef exists', () => {
      const endpointId: EndpointId = 'v1';
      const kref: KRef = 'ko1';
      const eref: ERef = 'o-1';
      clistMethods.addCListEntry(endpointId, kref, eref);
      expect(kv.get(`${endpointId}.c.${kref}`)).toBe(`R ${eref}`);
      expect(kv.get(`${endpointId}.c.${eref}`)).toBe(kref);
      clistMethods.forgetKref(endpointId, kref);
      expect(kv.get(`${endpointId}.c.${kref}`)).toBeUndefined();
      expect(kv.get(`${endpointId}.c.${eref}`)).toBeUndefined();
    });

    it('does nothing when KRef does not exist', () => {
      const endpointId: EndpointId = 'v1';
      const nonExistentKref: KRef = 'ko99';
      expect(() => {
        clistMethods.forgetKref(endpointId, nonExistentKref);
      }).not.toThrow();
      expect(kv.get(`${endpointId}.c.${nonExistentKref}`)).toBeUndefined();
    });
  });
});
