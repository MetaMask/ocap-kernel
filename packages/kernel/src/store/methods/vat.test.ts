import { describe, it, expect, beforeEach, vi } from 'vitest';

import { getBaseMethods } from './base.ts';
import { getVatMethods } from './vat.ts';
import type { VatConfig, VatId } from '../../types.ts';
import type { StoreContext } from '../types.ts';

vi.mock('./base.ts', () => ({
  getBaseMethods: vi.fn(),
}));

describe('vat store methods', () => {
  let mockKV: Map<string, string>;
  let mockGetPrefixedKeys = vi.fn();
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

  beforeEach(() => {
    mockKV = new Map();
    mockGetPrefixedKeys = vi.fn();

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
    } as StoreContext;

    vatMethods = getVatMethods(context);
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
});
