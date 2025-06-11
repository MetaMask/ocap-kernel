import { SubclusterNotFoundError } from '@metamask/kernel-errors';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { getBaseMethods } from './base.ts';
import { getSubclusterMethods } from './subclusters.ts';
import type {
  ClusterConfig,
  Subcluster,
  SubclusterId,
  VatConfig,
  VatId,
} from '../../types.ts';
import type { StoreContext, StoredValue } from '../types.ts';

vi.mock('./base.ts', () => ({
  getBaseMethods: vi.fn(),
}));

describe('getSubclusterMethods', () => {
  let mockIncCounter: ReturnType<typeof vi.fn>;
  let subclustersInternalValue: string | undefined;
  let vatMapInternalValue: string | undefined;
  let nextIdInternalValue: string | undefined;
  let mockSubclustersStorage: StoredValue;
  let mockVatToSubclusterMapStorage: StoredValue;
  let mockNextSubclusterIdCounter: StoredValue;
  let mockKvStore: unknown;
  let mockContext: StoreContext;
  let subclusterMethods: ReturnType<typeof getSubclusterMethods>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  const mockVatConfig1: VatConfig = { bundleName: 'bundleA' };
  const mockVatConfig2: VatConfig = { sourceSpec: './sourceB.js' };
  const mockClusterConfig1: ClusterConfig = {
    bootstrap: 'v1',
    vats: { v1: mockVatConfig1 },
  };
  const mockClusterConfig2: ClusterConfig = {
    bootstrap: 'v2',
    vats: { v2: mockVatConfig2, v1: mockVatConfig1 },
  };

  beforeEach(() => {
    mockIncCounter = vi.fn();
    (getBaseMethods as ReturnType<typeof vi.fn>).mockReturnValue({
      incCounter: mockIncCounter,
    });
    mockIncCounter.mockImplementation((storedValueMock: StoredValue) => {
      const currentVal = storedValueMock.get();
      const currentValue = currentVal ? parseInt(currentVal, 10) : 0;
      const nextValue = currentValue + 1;
      storedValueMock.set(String(nextValue));
      return String(nextValue);
    });

    subclustersInternalValue = '[]';
    vatMapInternalValue = '{}';
    nextIdInternalValue = '1';

    mockSubclustersStorage = {
      get: vi.fn(() => subclustersInternalValue),
      set: vi.fn((newValue: string) => {
        subclustersInternalValue = newValue;
      }),
      delete: vi.fn(() => {
        subclustersInternalValue = undefined;
      }),
    };

    mockVatToSubclusterMapStorage = {
      get: vi.fn(() => vatMapInternalValue),
      set: vi.fn((newValue: string) => {
        vatMapInternalValue = newValue;
      }),
      delete: vi.fn(() => {
        vatMapInternalValue = undefined;
      }),
    };

    mockNextSubclusterIdCounter = {
      get: vi.fn(() => nextIdInternalValue),
      set: vi.fn((newValue: string) => {
        nextIdInternalValue = newValue;
      }),
      delete: vi.fn(() => {
        nextIdInternalValue = undefined;
      }),
    };

    mockKvStore = {};

    mockContext = {
      kv: mockKvStore,
      subclusters: mockSubclustersStorage,
      vatToSubclusterMap: mockVatToSubclusterMapStorage,
      nextSubclusterId: mockNextSubclusterIdCounter,
    } as unknown as StoreContext;

    subclusterMethods = getSubclusterMethods(mockContext);
    consoleWarnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  describe('addSubcluster', () => {
    it('should add a new subcluster, increment ID, and return the new ID', () => {
      const newId = subclusterMethods.addSubcluster(mockClusterConfig1);
      expect(newId).toBe('s2');
      expect(mockIncCounter).toHaveBeenCalledWith(mockNextSubclusterIdCounter);
      expect(mockNextSubclusterIdCounter.get()).toBe('2');

      const subclustersRaw = mockSubclustersStorage.get();
      const subclusters = subclustersRaw
        ? (JSON.parse(subclustersRaw) as Subcluster[])
        : [];
      expect(subclusters).toHaveLength(1);
      expect(subclusters[0]).toStrictEqual({
        id: 's2',
        config: mockClusterConfig1,
        vats: [],
      });
    });

    it('should add multiple subclusters with incrementing IDs', () => {
      const id1 = subclusterMethods.addSubcluster(mockClusterConfig1);
      const id2 = subclusterMethods.addSubcluster(mockClusterConfig2);
      expect(id1).toBe('s2');
      expect(id2).toBe('s3');
      expect(mockIncCounter).toHaveBeenCalledTimes(2);
      expect(mockNextSubclusterIdCounter.get()).toBe('3');

      const subclustersRaw = mockSubclustersStorage.get();
      const subclusters = subclustersRaw
        ? (JSON.parse(subclustersRaw) as Subcluster[])
        : [];
      expect(subclusters).toHaveLength(2);
      expect(subclusters[1]).toStrictEqual({
        id: 's3',
        config: mockClusterConfig2,
        vats: [],
      });
    });

    it('should throw an error if generated ID already exists', () => {
      mockSubclustersStorage.set(
        JSON.stringify([{ id: 's2', config: mockClusterConfig1, vats: [] }]),
      );
      mockNextSubclusterIdCounter.set('1');

      expect(() => subclusterMethods.addSubcluster(mockClusterConfig1)).toThrow(
        'Generated subcluster ID s2 already exists. This indicates a potential issue with ID generation.',
      );
      expect(mockNextSubclusterIdCounter.get()).toBe('2');
    });
  });

  describe('hasSubcluster', () => {
    it('should return true if a subcluster exists', () => {
      const id = subclusterMethods.addSubcluster(mockClusterConfig1);
      expect(subclusterMethods.hasSubcluster(id)).toBe(true);
    });

    it('should return false if a subcluster does not exist', () => {
      expect(
        subclusterMethods.hasSubcluster('sNonExistent' as SubclusterId),
      ).toBe(false);
    });

    it('should return false if storage is empty', () => {
      expect(subclusterMethods.hasSubcluster('s1' as SubclusterId)).toBe(false);
    });
  });

  describe('getSubclusters', () => {
    it('should return all subclusters', () => {
      const id1 = subclusterMethods.addSubcluster(mockClusterConfig1);
      const id2 = subclusterMethods.addSubcluster(mockClusterConfig2);
      const all = subclusterMethods.getSubclusters();
      expect(all).toHaveLength(2);
      expect(all.find((sc) => sc.id === id1)?.config).toStrictEqual(
        mockClusterConfig1,
      );
      expect(all.find((sc) => sc.id === id2)?.config).toStrictEqual(
        mockClusterConfig2,
      );
    });

    it('should return an empty array if no subclusters exist', () => {
      expect(subclusterMethods.getSubclusters()).toStrictEqual([]);
    });
  });

  describe('getSubcluster', () => {
    it('should return a specific subcluster by ID', () => {
      const id = subclusterMethods.addSubcluster(mockClusterConfig1);
      const subcluster = subclusterMethods.getSubcluster(id);
      expect(subcluster).toBeDefined();
      expect(subcluster?.id).toBe(id);
      expect(subcluster?.config).toStrictEqual(mockClusterConfig1);
    });

    it('should return undefined if the subcluster is not found', () => {
      expect(
        subclusterMethods.getSubcluster('sNonExistent' as SubclusterId),
      ).toBeUndefined();
    });
  });

  describe('addSubclusterVat', () => {
    let scId: SubclusterId;
    const vatId1: VatId = 'v1';

    beforeEach(() => {
      scId = subclusterMethods.addSubcluster(mockClusterConfig1);
    });

    it('should add a vat to an existing subcluster and update map', () => {
      subclusterMethods.addSubclusterVat(scId, vatId1);

      const subclustersRaw = mockSubclustersStorage.get();
      const subclusters = subclustersRaw
        ? (JSON.parse(subclustersRaw) as Subcluster[])
        : [];
      const targetSubcluster = subclusters.find((sc) => sc.id === scId);
      expect(targetSubcluster?.vats).toContain(vatId1);

      const mapRaw = mockVatToSubclusterMapStorage.get();
      const map = mapRaw ? JSON.parse(mapRaw) : {};
      expect(map[vatId1]).toBe(scId);
    });

    it('should not add a duplicate vat to the same subcluster', () => {
      subclusterMethods.addSubclusterVat(scId, vatId1);
      subclusterMethods.addSubclusterVat(scId, vatId1);

      const subclustersRaw = mockSubclustersStorage.get();
      const subclusters = subclustersRaw
        ? (JSON.parse(subclustersRaw) as Subcluster[])
        : [];
      const targetSubcluster = subclusters.find((sc) => sc.id === scId);
      expect(targetSubcluster?.vats).toStrictEqual([vatId1]);
    });

    it('should update map and warn when moving a vat from another subcluster', () => {
      const scId2 = subclusterMethods.addSubcluster(mockClusterConfig2);
      subclusterMethods.addSubclusterVat(scId, vatId1);
      let mapRaw = mockVatToSubclusterMapStorage.get();
      let map = mapRaw ? JSON.parse(mapRaw) : {};
      expect(map[vatId1]).toBe(scId);

      subclusterMethods.addSubclusterVat(scId2, vatId1);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        `vat ${vatId1} is being moved from subcluster ${scId} to ${scId2}.`,
      );

      mapRaw = mockVatToSubclusterMapStorage.get();
      map = mapRaw ? JSON.parse(mapRaw) : {};
      expect(map[vatId1]).toBe(scId2);

      const subclustersRaw = mockSubclustersStorage.get();
      const subclusters = subclustersRaw
        ? (JSON.parse(subclustersRaw) as Subcluster[])
        : [];
      const originalSc = subclusters.find((sc) => sc.id === scId);
      const newSc = subclusters.find((sc) => sc.id === scId2);

      expect(originalSc?.vats).toContain(vatId1);
      expect(newSc?.vats).toContain(vatId1);
    });

    it('should throw SubclusterNotFoundError if subcluster does not exist', () => {
      const nonExistentId = 'sNonExistent' as SubclusterId;
      expect(() =>
        subclusterMethods.addSubclusterVat(nonExistentId, vatId1),
      ).toThrow(SubclusterNotFoundError);
    });
  });

  describe('getSubclusterVats', () => {
    let scId: SubclusterId;
    const vatId1: VatId = 'v1';
    const vatId2: VatId = 'v2';

    beforeEach(() => {
      scId = subclusterMethods.addSubcluster(mockClusterConfig1);
      subclusterMethods.addSubclusterVat(scId, vatId1);
      subclusterMethods.addSubclusterVat(scId, vatId2);
    });

    it('should return all vats for a given subcluster', () => {
      const vats = subclusterMethods.getSubclusterVats(scId);
      expect(vats).toHaveLength(2);
      expect(vats).toContain(vatId1);
      expect(vats).toContain(vatId2);
    });

    it('should return an empty array if the subcluster has no vats', () => {
      const scIdNew = subclusterMethods.addSubcluster(mockClusterConfig2);
      const vats = subclusterMethods.getSubclusterVats(scIdNew);
      expect(vats).toStrictEqual([]);
    });

    it('should throw SubclusterNotFoundError if subcluster does not exist', () => {
      const nonExistentId = 'sNonExistent' as SubclusterId;
      expect(() => subclusterMethods.getSubclusterVats(nonExistentId)).toThrow(
        SubclusterNotFoundError,
      );
    });

    it('should return a copy of the vats array, not a reference', () => {
      const vatsArray1 = subclusterMethods.getSubclusterVats(scId);
      expect(vatsArray1).toStrictEqual([vatId1, vatId2]);
      vatsArray1.push('v3-mutated' as VatId);

      const vatsArray2 = subclusterMethods.getSubclusterVats(scId);
      expect(vatsArray2).toStrictEqual([vatId1, vatId2]);
      expect(vatsArray2).not.toContain('v3-mutated');
    });
  });

  describe('deleteSubclusterVat', () => {
    let scId1: SubclusterId;
    let scId2: SubclusterId;
    const vatId1: VatId = 'v1';
    const vatId2: VatId = 'v2';

    beforeEach(() => {
      scId1 = subclusterMethods.addSubcluster(mockClusterConfig1);
      scId2 = subclusterMethods.addSubcluster(mockClusterConfig2);
      subclusterMethods.addSubclusterVat(scId1, vatId1);
      subclusterMethods.addSubclusterVat(scId1, vatId2);
      subclusterMethods.addSubclusterVat(scId2, vatId1);
    });

    it('should delete a vat from a subcluster and update map if map points to it', () => {
      subclusterMethods.deleteSubclusterVat(scId1, vatId2);

      const sc1 = subclusterMethods.getSubcluster(scId1) as Subcluster;
      expect(sc1.vats).not.toContain(vatId2);
      expect(sc1.vats).toContain(vatId1);

      const mapRaw = mockVatToSubclusterMapStorage.get();
      const map = mapRaw ? JSON.parse(mapRaw) : {};
      expect(map[vatId2]).toBeUndefined();
      expect(map[vatId1]).toBe(scId2);
    });

    it('should delete vat from subcluster vats list, even if map points elsewhere', () => {
      subclusterMethods.deleteSubclusterVat(scId1, vatId1);

      const sc1Updated = subclusterMethods.getSubcluster(scId1) as Subcluster;
      expect(sc1Updated.vats).not.toContain(vatId1);
      expect(sc1Updated.vats).toContain(vatId2);

      const mapRaw = mockVatToSubclusterMapStorage.get();
      const map = mapRaw ? JSON.parse(mapRaw) : {};
      expect(map[vatId1]).toBe(scId2);
    });

    it('should do nothing to subclusters list if subcluster is not found', () => {
      const initialSubclustersRaw = mockSubclustersStorage.get();
      const nonExistentScId = 'sNonExistentCluster' as SubclusterId;
      const someVat = 'vSomeVat' as VatId;
      mockVatToSubclusterMapStorage.set(
        JSON.stringify({ [someVat]: nonExistentScId }),
      );

      subclusterMethods.deleteSubclusterVat(nonExistentScId, someVat);

      expect(mockSubclustersStorage.get()).toBe(initialSubclustersRaw);
      const mapRaw = mockVatToSubclusterMapStorage.get();
      const map = mapRaw ? JSON.parse(mapRaw) : {};
      expect(map[someVat]).toBeUndefined();
    });

    it('should do nothing to subclusters list if vat is not in the specified subcluster', () => {
      const nonExistentVat = 'vNonExistent' as VatId;
      const sc1 = subclusterMethods.getSubcluster(scId1) as Subcluster;
      const sc1InitialVats = sc1 ? [...sc1.vats] : [];

      subclusterMethods.deleteSubclusterVat(scId1, nonExistentVat);

      const sc1After = subclusterMethods.getSubcluster(scId1) as Subcluster;
      expect(sc1After?.vats).toStrictEqual(sc1InitialVats);
    });

    it('should clear map entry if vat is mapped to a subclusterId being deleted from, but subcluster is not found in main list', () => {
      const vatX = 'vX' as VatId;
      const scGhostId = 'scGhost' as SubclusterId;
      mockVatToSubclusterMapStorage.set(JSON.stringify({ [vatX]: scGhostId }));

      subclusterMethods.deleteSubclusterVat(scGhostId, vatX);

      const mapRaw = mockVatToSubclusterMapStorage.get();
      const map = mapRaw ? JSON.parse(mapRaw) : {};
      expect(map[vatX]).toBeUndefined();
    });
  });

  describe('deleteSubcluster', () => {
    let scId1: SubclusterId;
    const vatId1: VatId = 'v1';
    const vatId2: VatId = 'v2';

    beforeEach(() => {
      scId1 = subclusterMethods.addSubcluster(mockClusterConfig1);
      subclusterMethods.addSubclusterVat(scId1, vatId1);
      subclusterMethods.addSubclusterVat(scId1, vatId2);
    });

    it('should delete a subcluster and remove its vats from the map', () => {
      expect(subclusterMethods.hasSubcluster(scId1)).toBe(true);
      expect(subclusterMethods.getVatSubcluster(vatId1)).toBe(scId1);
      expect(subclusterMethods.getVatSubcluster(vatId2)).toBe(scId1);

      subclusterMethods.deleteSubcluster(scId1);

      expect(subclusterMethods.hasSubcluster(scId1)).toBe(false);
      expect(subclusterMethods.getSubcluster(scId1)).toBeUndefined();
      expect(subclusterMethods.getVatSubcluster(vatId1)).toBeUndefined();
      expect(subclusterMethods.getVatSubcluster(vatId2)).toBeUndefined();

      const allSc = subclusterMethods.getSubclusters();
      expect(allSc.find((sc) => sc.id === scId1)).toBeUndefined();
    });

    it('should do nothing if subcluster is not found', () => {
      const initialSubclustersRaw = mockSubclustersStorage.get();
      const initialMapRaw = mockVatToSubclusterMapStorage.get();

      subclusterMethods.deleteSubcluster('sNonExistent' as SubclusterId);

      expect(mockSubclustersStorage.get()).toBe(initialSubclustersRaw);
      expect(mockVatToSubclusterMapStorage.get()).toBe(initialMapRaw);
      expect(subclusterMethods.hasSubcluster(scId1)).toBe(true);
    });

    it('should correctly update map if a vat was in multiple subclusters conceptually', () => {
      const scId2 = subclusterMethods.addSubcluster(mockClusterConfig2);
      const vatX = 'vX' as VatId;
      subclusterMethods.addSubclusterVat(scId1, vatX);

      const subclustersRaw = mockSubclustersStorage.get();
      const subclusters = subclustersRaw
        ? (JSON.parse(subclustersRaw) as Subcluster[])
        : [];
      const sc2obj = subclusters.find((sc) => sc.id === scId2);
      sc2obj?.vats.push(vatX);
      mockSubclustersStorage.set(JSON.stringify(subclusters));

      subclusterMethods.deleteSubcluster(scId1);

      expect(subclusterMethods.getVatSubcluster(vatX)).toBeUndefined();
      const sc2AfterDelete = subclusterMethods.getSubcluster(scId2);
      expect(sc2AfterDelete).toBeDefined();
      expect(sc2AfterDelete?.vats).toContain(vatX);
    });
  });

  describe('getVatSubcluster', () => {
    it('should return the subcluster ID for a given vat', () => {
      const scId = subclusterMethods.addSubcluster(mockClusterConfig1);
      const vatId: VatId = 'vTest';
      subclusterMethods.addSubclusterVat(scId, vatId);
      expect(subclusterMethods.getVatSubcluster(vatId)).toBe(scId);
    });

    it('should return undefined if the vat is not in any subcluster map', () => {
      expect(
        subclusterMethods.getVatSubcluster('vNonMapped' as VatId),
      ).toBeUndefined();
    });

    it('should return undefined if the map is empty', () => {
      mockVatToSubclusterMapStorage.set('{}');
      expect(subclusterMethods.getVatSubcluster('v1' as VatId)).toBeUndefined();
    });
  });

  describe('clearEmptySubclusters', () => {
    it('should remove subclusters with no vats', () => {
      const scId1 = subclusterMethods.addSubcluster(mockClusterConfig1);
      subclusterMethods.addSubcluster(mockClusterConfig2);
      const vatId = 'v1' as VatId;
      subclusterMethods.addSubclusterVat(scId1, vatId);

      subclusterMethods.clearEmptySubclusters();

      const subclusters = subclusterMethods.getSubclusters();
      expect(subclusters).toHaveLength(1);
      expect(subclusters[0]?.id).toBe(scId1);
      expect(subclusters[0]?.vats).toContain(vatId);
    });

    it('should do nothing if all subclusters have vats', () => {
      const scId1 = subclusterMethods.addSubcluster(mockClusterConfig1);
      const scId2 = subclusterMethods.addSubcluster(mockClusterConfig2);
      const vatId1 = 'v1' as VatId;
      const vatId2 = 'v2' as VatId;
      subclusterMethods.addSubclusterVat(scId1, vatId1);
      subclusterMethods.addSubclusterVat(scId2, vatId2);

      const initialSubclusters = subclusterMethods.getSubclusters();
      subclusterMethods.clearEmptySubclusters();
      const finalSubclusters = subclusterMethods.getSubclusters();

      expect(finalSubclusters).toStrictEqual(initialSubclusters);
    });

    it('should do nothing if there are no subclusters', () => {
      subclusterMethods.clearEmptySubclusters();
      expect(subclusterMethods.getSubclusters()).toStrictEqual([]);
    });
  });
});
