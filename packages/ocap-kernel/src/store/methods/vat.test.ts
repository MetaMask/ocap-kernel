import { describe, it, expect, beforeEach, vi } from 'vitest';

import { getBaseMethods } from './base.ts';
import * as clistModule from './clist.ts';
import * as objectModule from './object.ts';
import * as promiseModule from './promise.ts';
import * as reachableModule from './reachable.ts';
import * as refCountModule from './refcount.ts';
import { getVatMethods } from './vat.ts';
import type { VatConfig, VatId } from '../../types.ts';
import type { StoreContext } from '../types.ts';

// Mock the parseRef function
vi.mock('../utils/parse-ref.ts', () => ({
  parseRef: vi.fn((ref) => {
    if (ref.startsWith('o+')) {
      return { context: 'vat', direction: 'export', isPromise: false };
    } else if (ref.startsWith('o-')) {
      return { context: 'vat', direction: 'import', isPromise: false };
    } else if (ref.startsWith('p+')) {
      return { context: 'vat', direction: 'export', isPromise: true };
    } else if (ref.startsWith('ko')) {
      return { context: 'kernel', direction: null, isPromise: false };
    } else if (ref.startsWith('kp')) {
      return { context: 'kernel', direction: null, isPromise: true };
    }
    return { context: 'unknown', direction: null, isPromise: false };
  }),
}));

vi.mock('./base.ts', () => ({
  getBaseMethods: vi.fn(),
}));

vi.mock('./clist.ts', () => ({
  getCListMethods: vi.fn(),
}));

vi.mock('./promise.ts', () => ({
  getPromiseMethods: vi.fn(),
}));

vi.mock('./object.ts', () => ({
  getObjectMethods: vi.fn(),
}));

vi.mock('./reachable.ts', () => ({
  getReachableMethods: vi.fn(),
}));

vi.mock('./refcount.ts', () => ({
  getRefCountMethods: vi.fn(),
}));

describe('vat store methods', () => {
  let mockKV: Map<string, string>;
  let mockGetPrefixedKeys = vi.fn();
  let mockGetSlotKey = vi.fn();
  let mockGetOwnerKey = vi.fn();
  let mockTerminatedVats = {
    get: vi.fn(),
    set: vi.fn(),
  };
  let mockMaybeFreeKrefs = {
    add: vi.fn(),
  };
  let context: StoreContext;
  let vatMethods: ReturnType<typeof getVatMethods>;
  const vatID1 = 'v1' as VatId;
  const vatID2 = 'v2' as VatId;
  const vatConfig1: VatConfig = {
    name: 'test-vat-1',
    path: '/path/to/vat1',
    options: { manualStart: true },
  } as unknown as VatConfig;
  const vatConfig2: VatConfig = {
    name: 'test-vat-2',
    path: '/path/to/vat2',
    options: { manualStart: false },
  } as unknown as VatConfig;

  // Mock method implementations
  const mockDeleteCListEntry = vi.fn();
  const mockGetKernelPromise = vi.fn();
  const mockGetReachableAndVatSlot = vi.fn();
  const mockDecrementRefCount = vi.fn();
  const mockInitKernelPromise = vi.fn();
  const mockSetPromiseDecider = vi.fn();
  const mockInitKernelObject = vi.fn();
  const mockAddCListEntry = vi.fn();
  const mockIncrementRefCount = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    mockKV = new Map();
    mockGetPrefixedKeys = vi.fn();
    mockGetSlotKey = vi.fn((vatId, ref) => `slot.${vatId}.${ref}`);
    mockGetOwnerKey = vi.fn((ref) => `owner.${ref}`);
    mockTerminatedVats = {
      get: vi.fn().mockReturnValue('[]'),
      set: vi.fn(),
    };
    mockMaybeFreeKrefs = {
      add: vi.fn(),
    };

    (getBaseMethods as ReturnType<typeof vi.fn>).mockReturnValue({
      getPrefixedKeys: mockGetPrefixedKeys,
      getSlotKey: mockGetSlotKey,
      getOwnerKey: mockGetOwnerKey,
    });

    // Setup mock implementations for imported methods
    (clistModule.getCListMethods as ReturnType<typeof vi.fn>).mockReturnValue({
      deleteCListEntry: mockDeleteCListEntry,
      addCListEntry: mockAddCListEntry,
    });

    (
      promiseModule.getPromiseMethods as ReturnType<typeof vi.fn>
    ).mockReturnValue({
      getKernelPromise: mockGetKernelPromise,
      initKernelPromise: mockInitKernelPromise,
      setPromiseDecider: mockSetPromiseDecider,
    });

    (objectModule.getObjectMethods as ReturnType<typeof vi.fn>).mockReturnValue(
      {
        initKernelObject: mockInitKernelObject,
      },
    );

    (
      reachableModule.getReachableMethods as ReturnType<typeof vi.fn>
    ).mockReturnValue({
      getReachableAndVatSlot: mockGetReachableAndVatSlot,
    });

    (
      refCountModule.getRefCountMethods as ReturnType<typeof vi.fn>
    ).mockReturnValue({
      decrementRefCount: mockDecrementRefCount,
      incrementRefCount: mockIncrementRefCount,
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
      terminatedVats: mockTerminatedVats,
      maybeFreeKrefs: mockMaybeFreeKrefs,
    } as unknown as StoreContext;

    vatMethods = getVatMethods(context);

    // Default behavior for some mocks
    mockGetKernelPromise.mockReturnValue({});
    mockGetReachableAndVatSlot.mockReturnValue({ vatSlot: 'o+42' });
    mockInitKernelPromise.mockReturnValue(['kp123', {}]);
    mockInitKernelObject.mockReturnValue('ko456');
  });

  describe('getVatConfig', () => {
    it('retrieves vat configuration from storage', () => {
      mockKV.set(`vatConfig.${vatID1}`, JSON.stringify(vatConfig1));

      const result = vatMethods.getVatConfig(vatID1);

      expect(result).toStrictEqual(vatConfig1);
    });

    it('throws error if vat configuration does not exist', () => {
      expect(() => vatMethods.getVatConfig(vatID1)).toThrow(
        'Required key vatConfig.v1 not found',
      );
    });
  });

  describe('setVatConfig', () => {
    it('stores vat configuration in storage', () => {
      vatMethods.setVatConfig(vatID1, vatConfig1);

      const storedConfig = JSON.parse(
        mockKV.get(`vatConfig.${vatID1}`) as string,
      );
      expect(storedConfig).toStrictEqual(vatConfig1);
    });

    it('overwrites existing vat configuration', () => {
      mockKV.set(`vatConfig.${vatID1}`, JSON.stringify(vatConfig1));

      const updatedConfig = {
        ...vatConfig1,
        name: 'updated-vat',
      } as unknown as VatConfig;

      vatMethods.setVatConfig(vatID1, updatedConfig);

      const storedConfig = JSON.parse(
        mockKV.get(`vatConfig.${vatID1}`) as string,
      );
      expect(storedConfig).toStrictEqual(updatedConfig);
    });
  });

  describe('deleteVatConfig', () => {
    it('removes vat configuration from storage', () => {
      mockKV.set(`vatConfig.${vatID1}`, JSON.stringify(vatConfig1));

      vatMethods.deleteVatConfig(vatID1);

      expect(mockKV.has(`vatConfig.${vatID1}`)).toBe(false);
    });

    it('does nothing if vat configuration does not exist', () => {
      expect(() => vatMethods.deleteVatConfig(vatID1)).not.toThrow();
    });
  });

  describe('getAllVatRecords', () => {
    it('yields all stored vat records', () => {
      mockKV.set(`vatConfig.${vatID1}`, JSON.stringify(vatConfig1));
      mockKV.set(`vatConfig.${vatID2}`, JSON.stringify(vatConfig2));

      mockGetPrefixedKeys.mockReturnValue([
        `vatConfig.${vatID1}`,
        `vatConfig.${vatID2}`,
      ]);

      const records = Array.from(vatMethods.getAllVatRecords());

      expect(records).toStrictEqual([
        { vatID: vatID1, vatConfig: vatConfig1 },
        { vatID: vatID2, vatConfig: vatConfig2 },
      ]);
      expect(mockGetPrefixedKeys).toHaveBeenCalledWith('vatConfig.');
    });

    it('yields an empty array when no vats are configured', () => {
      mockGetPrefixedKeys.mockReturnValue([]);

      const records = Array.from(vatMethods.getAllVatRecords());

      expect(records).toStrictEqual([]);
    });
  });

  describe('deleteEndpoint', () => {
    it('deletes all keys related to the endpoint', () => {
      const endpointId = 'e1';

      // Setup mock data
      mockKV.set(`cle.${endpointId}.obj1`, 'data1');
      mockKV.set(`cle.${endpointId}.obj2`, 'data2');
      mockKV.set(`clk.${endpointId}.prom1`, 'data3');
      mockKV.set(`e.nextObjectId.${endpointId}`, '10');
      mockKV.set(`e.nextPromiseId.${endpointId}`, '5');

      mockGetPrefixedKeys.mockImplementation((prefix: string) => {
        if (prefix === `cle.${endpointId}.`) {
          return [`cle.${endpointId}.obj1`, `cle.${endpointId}.obj2`];
        }
        if (prefix === `clk.${endpointId}.`) {
          return [`clk.${endpointId}.prom1`];
        }
        return [];
      });

      vatMethods.deleteEndpoint(endpointId);

      expect(mockKV.has(`cle.${endpointId}.obj1`)).toBe(false);
      expect(mockKV.has(`cle.${endpointId}.obj2`)).toBe(false);
      expect(mockKV.has(`clk.${endpointId}.prom1`)).toBe(false);
      expect(mockKV.has(`e.nextObjectId.${endpointId}`)).toBe(false);
      expect(mockKV.has(`e.nextPromiseId.${endpointId}`)).toBe(false);

      expect(mockGetPrefixedKeys).toHaveBeenCalledWith(`cle.${endpointId}.`);
      expect(mockGetPrefixedKeys).toHaveBeenCalledWith(`clk.${endpointId}.`);
    });

    it('does nothing if endpoint has no associated keys', () => {
      const endpointId = 'nonexistent';

      mockGetPrefixedKeys.mockReturnValue([]);

      expect(() => vatMethods.deleteEndpoint(endpointId)).not.toThrow();

      expect(mockGetPrefixedKeys).toHaveBeenCalledWith(`cle.${endpointId}.`);
      expect(mockGetPrefixedKeys).toHaveBeenCalledWith(`clk.${endpointId}.`);
    });
  });

  describe('getVatIDs', () => {
    it('returns all vat IDs from storage', () => {
      mockGetPrefixedKeys.mockReturnValue([
        `vatConfig.${vatID1}`,
        `vatConfig.${vatID2}`,
        `vatConfig.v3`,
      ]);

      const result = vatMethods.getVatIDs();

      expect(result).toStrictEqual([vatID1, vatID2, 'v3']);
      expect(mockGetPrefixedKeys).toHaveBeenCalledWith('vatConfig.');
    });

    it('returns an empty array when no vats are configured', () => {
      mockGetPrefixedKeys.mockReturnValue([]);

      const result = vatMethods.getVatIDs();

      expect(result).toStrictEqual([]);
      expect(mockGetPrefixedKeys).toHaveBeenCalledWith('vatConfig.');
    });
  });

  describe('getTerminatedVats', () => {
    it('returns empty array when no vats are terminated', () => {
      mockTerminatedVats.get.mockReturnValue('[]');

      const result = vatMethods.getTerminatedVats();

      expect(result).toStrictEqual([]);
      expect(mockTerminatedVats.get).toHaveBeenCalled();
    });

    it('returns array of terminated vat IDs', () => {
      mockTerminatedVats.get.mockReturnValue(JSON.stringify([vatID1, vatID2]));

      const result = vatMethods.getTerminatedVats();

      expect(result).toStrictEqual([vatID1, vatID2]);
      expect(mockTerminatedVats.get).toHaveBeenCalled();
    });

    it('returns empty array when no terminated vats data exists', () => {
      mockTerminatedVats.get.mockReturnValue(null);

      const result = vatMethods.getTerminatedVats();

      expect(result).toStrictEqual([]);
      expect(mockTerminatedVats.get).toHaveBeenCalled();
    });
  });

  describe('markVatAsTerminated', () => {
    it('adds a vat to the terminated vats list', () => {
      mockTerminatedVats.get.mockReturnValue('[]');

      vatMethods.markVatAsTerminated(vatID1);

      expect(mockTerminatedVats.set).toHaveBeenCalledWith(
        JSON.stringify([vatID1]),
      );
      expect(mockTerminatedVats.get).toHaveBeenCalled();
    });

    it('does not add a vat that is already in the terminated list', () => {
      mockTerminatedVats.get.mockReturnValue(JSON.stringify([vatID1]));

      vatMethods.markVatAsTerminated(vatID1);

      expect(mockTerminatedVats.set).not.toHaveBeenCalled();
      expect(mockTerminatedVats.get).toHaveBeenCalled();
    });

    it('appends to existing terminated vats list', () => {
      mockTerminatedVats.get.mockReturnValue(JSON.stringify([vatID1]));

      vatMethods.markVatAsTerminated(vatID2);

      expect(mockTerminatedVats.set).toHaveBeenCalledWith(
        JSON.stringify([vatID1, vatID2]),
      );
      expect(mockTerminatedVats.get).toHaveBeenCalled();
    });
  });

  describe('forgetTerminatedVat', () => {
    it('removes a vat from the terminated vats list', () => {
      mockTerminatedVats.get.mockReturnValue(JSON.stringify([vatID1, vatID2]));

      vatMethods.forgetTerminatedVat(vatID1);

      expect(mockTerminatedVats.set).toHaveBeenCalledWith(
        JSON.stringify([vatID2]),
      );
      expect(mockTerminatedVats.get).toHaveBeenCalled();
    });

    it('does nothing if vat is not in the terminated list', () => {
      mockTerminatedVats.get.mockReturnValue(JSON.stringify([vatID2]));

      vatMethods.forgetTerminatedVat(vatID1);

      expect(mockTerminatedVats.set).toHaveBeenCalledWith(
        JSON.stringify([vatID2]),
      );
      expect(mockTerminatedVats.get).toHaveBeenCalled();
    });

    it('handles empty terminated vats list', () => {
      mockTerminatedVats.get.mockReturnValue('[]');

      vatMethods.forgetTerminatedVat(vatID1);

      expect(mockTerminatedVats.set).toHaveBeenCalledWith('[]');
      expect(mockTerminatedVats.get).toHaveBeenCalled();
    });
  });

  describe('isVatTerminated', () => {
    it('returns true if vat is in terminated list', () => {
      mockTerminatedVats.get.mockReturnValue(JSON.stringify([vatID1, vatID2]));
      const result = vatMethods.isVatTerminated(vatID1);
      expect(result).toBe(true);
      expect(mockTerminatedVats.get).toHaveBeenCalled();
    });

    it('returns false if vat is not in terminated list', () => {
      mockTerminatedVats.get.mockReturnValue(JSON.stringify([vatID2]));

      const result = vatMethods.isVatTerminated(vatID1);

      expect(result).toBe(false);
      expect(mockTerminatedVats.get).toHaveBeenCalled();
    });

    it('returns false if terminated list is empty', () => {
      mockTerminatedVats.get.mockReturnValue('[]');

      const result = vatMethods.isVatTerminated(vatID1);

      expect(result).toBe(false);
      expect(mockTerminatedVats.get).toHaveBeenCalled();
    });
  });

  describe('exportFromEndpoint', () => {
    it('creates a kernel promise for an exported promise', () => {
      const vatId = 'v1' as VatId;
      const vref = 'p+42'; // Promise export reference

      const result = vatMethods.exportFromEndpoint(vatId, vref);

      expect(result).toBe('kp123');
      expect(mockInitKernelPromise).toHaveBeenCalled();
      expect(mockSetPromiseDecider).toHaveBeenCalledWith('kp123', vatId);
      expect(mockAddCListEntry).toHaveBeenCalledWith(vatId, 'kp123', vref);
      expect(mockIncrementRefCount).toHaveBeenCalledWith('kp123', 'export', {
        isExport: true,
        onlyRecognizable: true,
      });
    });

    it('creates a kernel object for an exported object', () => {
      const vatId = 'v1' as VatId;
      const vref = 'o+42'; // Object export reference

      const result = vatMethods.exportFromEndpoint(vatId, vref);

      expect(result).toBe('ko456');
      expect(mockInitKernelObject).toHaveBeenCalledWith(vatId);
      expect(mockAddCListEntry).toHaveBeenCalledWith(vatId, 'ko456', vref);
      expect(mockIncrementRefCount).toHaveBeenCalledWith('ko456', 'export', {
        isExport: true,
        onlyRecognizable: true,
      });
    });

    it('throws an error for invalid vat ID', () => {
      const vatId = 'invalid' as VatId;
      const vref = 'o+42';

      expect(() => vatMethods.exportFromEndpoint(vatId, vref)).toThrow(
        'not a valid EndpointId',
      );
    });

    it('throws an error for non-export reference', () => {
      const vatId = 'v1' as VatId;
      const vref = 'o-42'; // Import reference, not export

      expect(() => vatMethods.exportFromEndpoint(vatId, vref)).toThrow(
        'is not an export reference',
      );
    });

    it('throws an error for non-vat reference', () => {
      const vatId = 'v1' as VatId;
      const vref = 'ko42'; // Kernel reference, not vat reference

      expect(() => vatMethods.exportFromEndpoint(vatId, vref)).toThrow(
        'is not an ERef',
      );
    });
  });

  describe('isVatActive', () => {
    it('returns true when vat configuration exists', () => {
      mockKV.set(`vatConfig.${vatID1}`, JSON.stringify(vatConfig1));

      const result = vatMethods.isVatActive(vatID1);

      expect(result).toBe(true);
    });

    it('returns false when vat configuration does not exist', () => {
      const result = vatMethods.isVatActive(vatID1);

      expect(result).toBe(false);
    });

    it('returns false after vat configuration is deleted', () => {
      mockKV.set(`vatConfig.${vatID1}`, JSON.stringify(vatConfig1));
      expect(vatMethods.isVatActive(vatID1)).toBe(true);

      mockKV.delete(`vatConfig.${vatID1}`);

      const result = vatMethods.isVatActive(vatID1);
      expect(result).toBe(false);
    });
  });
});
