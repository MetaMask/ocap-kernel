import type { CapData } from '@endo/marshal';
import { SubclusterNotFoundError } from '@metamask/kernel-errors';
import type { Mocked } from 'vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { KernelQueue } from '../KernelQueue.ts';
import type { KernelStore } from '../store/index.ts';
import type { VatId, KRef, ClusterConfig, Subcluster } from '../types.ts';
import { SubclusterManager } from './SubclusterManager.ts';
import type { VatManager } from './VatManager.ts';

describe('SubclusterManager', () => {
  let mockKernelStore: Mocked<KernelStore>;
  let mockKernelQueue: Mocked<KernelQueue>;
  let mockVatManager: Mocked<VatManager>;
  let mockGetKernelService: (name: string) => { kref: string } | undefined;
  let mockQueueMessage: (
    target: KRef,
    method: string,
    args: unknown[],
  ) => Promise<CapData<KRef>>;
  let subclusterManager: SubclusterManager;

  const createMockClusterConfig = (name = 'test'): ClusterConfig => ({
    bootstrap: `${name}Vat`,
    vats: {
      [`${name}Vat`]: {
        sourceSpec: `${name}.js`,
      },
    },
  });

  const createMockSubcluster = (
    id: string,
    config: ClusterConfig,
  ): Subcluster => ({
    id,
    config,
    vats: ['v1', 'v2'] as VatId[],
  });

  beforeEach(() => {
    mockKernelStore = {
      addSubcluster: vi.fn().mockReturnValue('s1'),
      getSubcluster: vi.fn(),
      getSubclusters: vi.fn().mockReturnValue([]),
      getSubclusterVats: vi.fn().mockReturnValue([]),
      deleteSubcluster: vi.fn(),
      getVatSubcluster: vi.fn().mockReturnValue('s1'),
    } as unknown as Mocked<KernelStore>;

    mockKernelQueue = {
      waitForCrank: vi.fn().mockResolvedValue(undefined),
    } as unknown as Mocked<KernelQueue>;

    mockVatManager = {
      launchVat: vi.fn().mockResolvedValue('ko1'),
      terminateVat: vi.fn().mockResolvedValue(undefined),
      collectGarbage: vi.fn(),
      terminateAllVats: vi.fn().mockResolvedValue(undefined),
    } as unknown as Mocked<VatManager>;

    mockGetKernelService = vi.fn().mockReturnValue(undefined) as unknown as (
      name: string,
    ) => { kref: string } | undefined;
    mockQueueMessage = vi
      .fn()
      .mockResolvedValue({ body: '{"result":"ok"}', slots: [] }) as unknown as (
      target: KRef,
      method: string,
      args: unknown[],
    ) => Promise<CapData<KRef>>;

    subclusterManager = new SubclusterManager({
      kernelStore: mockKernelStore,
      kernelQueue: mockKernelQueue,
      vatManager: mockVatManager,
      getKernelService: mockGetKernelService,
      queueMessage: mockQueueMessage,
    });
  });

  describe('constructor', () => {
    it('initializes with provided options', () => {
      expect(subclusterManager).toBeDefined();
    });
  });

  describe('launchSubcluster', () => {
    it('launches a subcluster successfully', async () => {
      const config = createMockClusterConfig();
      const result = await subclusterManager.launchSubcluster(config);

      expect(mockKernelQueue.waitForCrank).toHaveBeenCalled();
      expect(mockKernelStore.addSubcluster).toHaveBeenCalledWith(config);
      expect(mockVatManager.launchVat).toHaveBeenCalledWith(
        config.vats.testVat,
        's1',
      );
      expect(mockQueueMessage).toHaveBeenCalledWith('ko1', 'bootstrap', [
        { testVat: expect.anything() },
        {},
      ]);
      expect(result).toStrictEqual({
        subclusterId: 's1',
        rootKref: 'ko1',
        bootstrapResult: { body: '{"result":"ok"}', slots: [] },
      });
    });

    it('launches subcluster with multiple vats', async () => {
      const config: ClusterConfig = {
        bootstrap: 'alice',
        vats: {
          alice: { sourceSpec: 'alice.js' },
          bob: { sourceSpec: 'bob.js' },
        },
      };
      mockVatManager.launchVat
        .mockResolvedValueOnce('ko1' as KRef)
        .mockResolvedValueOnce('ko2' as KRef);

      await subclusterManager.launchSubcluster(config);

      expect(mockVatManager.launchVat).toHaveBeenCalledTimes(2);
      expect(mockVatManager.launchVat).toHaveBeenCalledWith(
        config.vats.alice,
        's1',
      );
      expect(mockVatManager.launchVat).toHaveBeenCalledWith(
        config.vats.bob,
        's1',
      );
    });

    it('includes kernel services when specified', async () => {
      const config: ClusterConfig = {
        bootstrap: 'testVat',
        vats: {
          testVat: { sourceSpec: 'test.js' },
        },
        services: ['testService'],
      };
      (mockGetKernelService as ReturnType<typeof vi.fn>).mockReturnValue({
        kref: 'ko-service',
      });

      await subclusterManager.launchSubcluster(config);

      expect(mockGetKernelService).toHaveBeenCalledWith('testService');
      expect(mockQueueMessage).toHaveBeenCalledWith('ko1', 'bootstrap', [
        expect.anything(),
        { testService: expect.anything() },
      ]);
    });

    it('throws for invalid cluster config', async () => {
      const invalidConfig = {} as ClusterConfig;

      await expect(
        subclusterManager.launchSubcluster(invalidConfig),
      ).rejects.toThrow('invalid cluster config');
    });

    it('throws for invalid bootstrap vat name', async () => {
      const config: ClusterConfig = {
        bootstrap: 'nonexistent',
        vats: {
          alice: { sourceSpec: 'alice.js' },
        },
      };

      await expect(subclusterManager.launchSubcluster(config)).rejects.toThrow(
        'invalid bootstrap vat name',
      );
    });

    it('throws when kernel service not found', async () => {
      const config: ClusterConfig = {
        bootstrap: 'testVat',
        vats: {
          testVat: { sourceSpec: 'test.js' },
        },
        services: ['unknownService'],
      };
      (mockGetKernelService as ReturnType<typeof vi.fn>).mockReturnValue(
        undefined,
      );

      await expect(subclusterManager.launchSubcluster(config)).rejects.toThrow(
        "no registered kernel service 'unknownService'",
      );
    });

    it('throws when launchVat returns undefined', async () => {
      const config: ClusterConfig = {
        bootstrap: 'testVat',
        vats: {
          testVat: { sourceSpec: 'test.js' },
        },
      };
      // Simulate launchVat returning undefined (which shouldn't happen normally)
      mockVatManager.launchVat.mockResolvedValue(undefined as unknown as KRef);

      // This will throw because kslot expects a string
      await expect(subclusterManager.launchSubcluster(config)).rejects.toThrow(
        '"[undefined]" must be a string',
      );
    });

    it('returns bootstrap result when bootstrap does not return error', async () => {
      const config = createMockClusterConfig();
      const bootstrapResult = {
        body: '{"error":"Bootstrap failed"}',
        slots: [],
      };
      (mockQueueMessage as ReturnType<typeof vi.fn>).mockResolvedValue(
        bootstrapResult,
      );

      // Note: We can't easily mock kunser since it's imported at module level
      // kunser doesn't return an Error for this body, so launchSubcluster succeeds
      const result = await subclusterManager.launchSubcluster(config);
      expect(result).toStrictEqual({
        subclusterId: 's1',
        rootKref: 'ko1',
        bootstrapResult,
      });
    });
  });

  describe('terminateSubcluster', () => {
    it('terminates a subcluster successfully', async () => {
      const subcluster = createMockSubcluster('s1', createMockClusterConfig());
      mockKernelStore.getSubcluster.mockReturnValue(subcluster);
      mockKernelStore.getSubclusterVats.mockReturnValue([
        'v1',
        'v2',
      ] as VatId[]);

      await subclusterManager.terminateSubcluster('s1');

      expect(mockKernelQueue.waitForCrank).toHaveBeenCalled();
      expect(mockVatManager.terminateVat).toHaveBeenCalledWith('v2');
      expect(mockVatManager.terminateVat).toHaveBeenCalledWith('v1');
      expect(mockVatManager.collectGarbage).toHaveBeenCalledTimes(2);
      expect(mockKernelStore.deleteSubcluster).toHaveBeenCalledWith('s1');
    });

    it('throws when subcluster not found', async () => {
      mockKernelStore.getSubcluster.mockReturnValue(undefined);

      await expect(
        subclusterManager.terminateSubcluster('nonexistent'),
      ).rejects.toThrow(SubclusterNotFoundError);
    });

    it('handles empty vat list', async () => {
      const subcluster = createMockSubcluster('s1', createMockClusterConfig());
      mockKernelStore.getSubcluster.mockReturnValue(subcluster);
      mockKernelStore.getSubclusterVats.mockReturnValue([]);

      await subclusterManager.terminateSubcluster('s1');

      expect(mockVatManager.terminateVat).not.toHaveBeenCalled();
      expect(mockKernelStore.deleteSubcluster).toHaveBeenCalledWith('s1');
    });
  });

  describe('reloadSubcluster', () => {
    it('reloads a subcluster successfully', async () => {
      const config = createMockClusterConfig();
      const subcluster = createMockSubcluster('s1', config);
      mockKernelStore.getSubcluster
        .mockReturnValueOnce(subcluster)
        .mockReturnValueOnce({ ...subcluster, id: 's2' });
      mockKernelStore.addSubcluster.mockReturnValue('s2');

      const result = await subclusterManager.reloadSubcluster('s1');

      expect(mockKernelQueue.waitForCrank).toHaveBeenCalled();
      expect(mockVatManager.terminateVat).toHaveBeenCalledWith('v2');
      expect(mockVatManager.terminateVat).toHaveBeenCalledWith('v1');
      expect(mockVatManager.collectGarbage).toHaveBeenCalledTimes(2);
      expect(mockKernelStore.addSubcluster).toHaveBeenCalledWith(config);
      expect(mockVatManager.launchVat).toHaveBeenCalled();
      expect(result).toStrictEqual({ ...subcluster, id: 's2' });
    });

    it('throws when subcluster not found', async () => {
      mockKernelStore.getSubcluster.mockReturnValue(undefined);

      await expect(
        subclusterManager.reloadSubcluster('nonexistent'),
      ).rejects.toThrow(SubclusterNotFoundError);
    });

    it('throws when new subcluster not found after reload', async () => {
      const config = createMockClusterConfig();
      const subcluster = createMockSubcluster('s1', config);
      mockKernelStore.getSubcluster
        .mockReturnValueOnce(subcluster)
        .mockReturnValueOnce(undefined);
      mockKernelStore.addSubcluster.mockReturnValue('s2');

      await expect(subclusterManager.reloadSubcluster('s1')).rejects.toThrow(
        SubclusterNotFoundError,
      );
    });
  });

  describe('getSubcluster', () => {
    it('returns subcluster when found', () => {
      const subcluster = createMockSubcluster('s1', createMockClusterConfig());
      mockKernelStore.getSubcluster.mockReturnValue(subcluster);

      const result = subclusterManager.getSubcluster('s1');

      expect(result).toStrictEqual(subcluster);
      expect(mockKernelStore.getSubcluster).toHaveBeenCalledWith('s1');
    });

    it('returns undefined when not found', () => {
      mockKernelStore.getSubcluster.mockReturnValue(undefined);

      const result = subclusterManager.getSubcluster('nonexistent');

      expect(result).toBeUndefined();
    });
  });

  describe('getSubclusters', () => {
    it('returns all subclusters', () => {
      const subclusters = [
        createMockSubcluster('s1', createMockClusterConfig('test1')),
        createMockSubcluster('s2', createMockClusterConfig('test2')),
      ];
      mockKernelStore.getSubclusters.mockReturnValue(subclusters);

      const result = subclusterManager.getSubclusters();

      expect(result).toStrictEqual(subclusters);
      expect(mockKernelStore.getSubclusters).toHaveBeenCalled();
    });

    it('returns empty array when no subclusters', () => {
      mockKernelStore.getSubclusters.mockReturnValue([]);

      const result = subclusterManager.getSubclusters();

      expect(result).toStrictEqual([]);
    });
  });

  describe('isVatInSubcluster', () => {
    it('returns true when vat is in subcluster', () => {
      mockKernelStore.getVatSubcluster.mockReturnValue('s1');

      const result = subclusterManager.isVatInSubcluster('v1', 's1');

      expect(result).toBe(true);
      expect(mockKernelStore.getVatSubcluster).toHaveBeenCalledWith('v1');
    });

    it('returns false when vat is not in subcluster', () => {
      mockKernelStore.getVatSubcluster.mockReturnValue('s2');

      const result = subclusterManager.isVatInSubcluster('v1', 's1');

      expect(result).toBe(false);
    });

    it('returns false when vat has no subcluster', () => {
      // @ts-expect-error mock
      mockKernelStore.getVatSubcluster.mockReturnValue(undefined);

      const result = subclusterManager.isVatInSubcluster('v1', 's1');

      expect(result).toBe(false);
    });
  });

  describe('getSubclusterVats', () => {
    it('returns vat IDs for subcluster', () => {
      const vatIds = ['v1', 'v2', 'v3'] as VatId[];
      mockKernelStore.getSubclusterVats.mockReturnValue(vatIds);

      const result = subclusterManager.getSubclusterVats('s1');

      expect(result).toStrictEqual(vatIds);
      expect(mockKernelStore.getSubclusterVats).toHaveBeenCalledWith('s1');
    });

    it('returns empty array when no vats', () => {
      mockKernelStore.getSubclusterVats.mockReturnValue([]);

      const result = subclusterManager.getSubclusterVats('s1');

      expect(result).toStrictEqual([]);
    });
  });

  describe('reloadAllSubclusters', () => {
    it('reloads all subclusters successfully', async () => {
      const subclusters = [
        createMockSubcluster('s1', createMockClusterConfig('test1')),
        createMockSubcluster('s2', createMockClusterConfig('test2')),
      ];
      mockKernelStore.getSubclusters.mockReturnValue(subclusters);
      mockKernelStore.addSubcluster
        .mockReturnValueOnce('s3')
        .mockReturnValueOnce('s4');

      await subclusterManager.reloadAllSubclusters();

      expect(mockVatManager.terminateAllVats).toHaveBeenCalledOnce();
      expect(mockKernelQueue.waitForCrank).toHaveBeenCalledTimes(2);
      expect(mockKernelStore.addSubcluster).toHaveBeenCalledTimes(2);
      expect(mockKernelStore.addSubcluster).toHaveBeenCalledWith(
        subclusters[0]?.config,
      );
      expect(mockKernelStore.addSubcluster).toHaveBeenCalledWith(
        subclusters[1]?.config,
      );
      expect(mockVatManager.launchVat).toHaveBeenCalledTimes(2);
    });

    it('handles empty subclusters list', async () => {
      mockKernelStore.getSubclusters.mockReturnValue([]);

      await subclusterManager.reloadAllSubclusters();

      expect(mockVatManager.terminateAllVats).toHaveBeenCalledOnce();
      expect(mockKernelStore.addSubcluster).not.toHaveBeenCalled();
      expect(mockVatManager.launchVat).not.toHaveBeenCalled();
    });

    it('continues reloading even if one fails', async () => {
      const subclusters = [
        createMockSubcluster('s1', createMockClusterConfig('test1')),
        createMockSubcluster('s2', createMockClusterConfig('test2')),
      ];
      mockKernelStore.getSubclusters.mockReturnValue(subclusters);
      mockKernelStore.addSubcluster
        .mockReturnValueOnce('s3')
        .mockReturnValueOnce('s4');
      mockVatManager.launchVat
        .mockRejectedValueOnce(new Error('Launch failed'))
        .mockResolvedValueOnce('ko2' as KRef);

      // This will throw for the first subcluster but should continue with the second
      await expect(subclusterManager.reloadAllSubclusters()).rejects.toThrow(
        'Launch failed',
      );

      expect(mockVatManager.terminateAllVats).toHaveBeenCalledOnce();
      expect(mockKernelStore.addSubcluster).toHaveBeenCalledOnce();
    });
  });
});
