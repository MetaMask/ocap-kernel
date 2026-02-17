import type { CapData } from '@endo/marshal';
import { SubclusterNotFoundError } from '@metamask/kernel-errors';
import type { Mocked } from 'vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { KernelQueue } from '../KernelQueue.ts';
import type { KernelStore } from '../store/index.ts';
import type {
  VatId,
  KRef,
  ClusterConfig,
  Subcluster,
  SystemSubclusterConfig,
} from '../types.ts';
import { SubclusterManager } from './SubclusterManager.ts';
import type { VatManager } from './VatManager.ts';

describe('SubclusterManager', () => {
  let mockKernelStore: Mocked<KernelStore>;
  let mockKernelQueue: Mocked<KernelQueue>;
  let mockVatManager: Mocked<VatManager>;
  let mockGetKernelService: (
    name: string,
  ) => { kref: string; systemOnly: boolean } | undefined;
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
    vats: { [`${config.bootstrap}`]: 'v1', vat2: 'v2' } as Record<
      string,
      VatId
    >,
  });

  beforeEach(() => {
    mockKernelStore = {
      addSubcluster: vi.fn().mockReturnValue('s1'),
      getSubcluster: vi.fn(),
      getSubclusters: vi.fn().mockReturnValue([]),
      getSubclusterVats: vi.fn().mockReturnValue([]),
      deleteSubcluster: vi.fn(),
      getVatSubcluster: vi.fn().mockReturnValue('s1'),
      getAllSystemSubclusterMappings: vi.fn().mockReturnValue(new Map()),
      deleteSystemSubclusterMapping: vi.fn(),
      setSystemSubclusterMapping: vi.fn(),
      getRootObject: vi.fn(),
      deleteVatConfig: vi.fn(),
      markVatAsTerminated: vi.fn(),
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
    ) => { kref: string; systemOnly: boolean } | undefined;
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
        'testVat',
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
        'alice',
        's1',
      );
      expect(mockVatManager.launchVat).toHaveBeenCalledWith(
        config.vats.bob,
        'bob',
        's1',
      );
    });

    it('includes unrestricted kernel services when specified', async () => {
      const config: ClusterConfig = {
        bootstrap: 'testVat',
        vats: {
          testVat: { sourceSpec: 'test.js' },
        },
        services: ['testService'],
      };
      (mockGetKernelService as ReturnType<typeof vi.fn>).mockReturnValue({
        kref: 'ko-service',
        systemOnly: false,
      });

      await subclusterManager.launchSubcluster(config);

      expect(mockGetKernelService).toHaveBeenCalledWith('testService');
      expect(mockQueueMessage).toHaveBeenCalledWith('ko1', 'bootstrap', [
        expect.anything(),
        { testService: expect.anything() },
      ]);
    });

    it('throws when user subcluster requests a restricted service', async () => {
      const config: ClusterConfig = {
        bootstrap: 'testVat',
        vats: {
          testVat: { sourceSpec: 'test.js' },
        },
        services: ['kernelFacet'],
      };
      (mockGetKernelService as ReturnType<typeof vi.fn>).mockReturnValue({
        kref: 'ko-service',
        systemOnly: true,
      });

      await expect(subclusterManager.launchSubcluster(config)).rejects.toThrow(
        "no registered kernel service 'kernelFacet'",
      );
    });

    it('allows system subcluster to access restricted services', async () => {
      const config: ClusterConfig = {
        bootstrap: 'testVat',
        vats: {
          testVat: { sourceSpec: 'test.js' },
        },
        services: ['kernelFacet'],
      };
      (mockGetKernelService as ReturnType<typeof vi.fn>).mockReturnValue({
        kref: 'ko-service',
        systemOnly: true,
      });

      await subclusterManager.launchSubcluster(config, { isSystem: true });

      expect(mockGetKernelService).toHaveBeenCalledWith('kernelFacet');
      expect(mockQueueMessage).toHaveBeenCalledWith('ko1', 'bootstrap', [
        expect.anything(),
        { kernelFacet: expect.anything() },
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

    it('cleans up IO channels and subcluster on validation failure', async () => {
      const mockIOManager = {
        createChannels: vi.fn().mockResolvedValue(undefined),
        destroyChannels: vi.fn().mockResolvedValue(undefined),
      };
      const mgr = new SubclusterManager({
        kernelStore: mockKernelStore,
        kernelQueue: mockKernelQueue,
        vatManager: mockVatManager,
        getKernelService: mockGetKernelService,
        queueMessage: mockQueueMessage,
        ioManager: mockIOManager as never,
      });

      const config: ClusterConfig = {
        bootstrap: 'testVat',
        vats: { testVat: { sourceSpec: 'test.js' } },
        services: ['unknownService'],
        io: {
          repl: { type: 'socket', path: '/tmp/repl.sock' },
        },
      };
      (mockGetKernelService as ReturnType<typeof vi.fn>).mockReturnValue(
        undefined,
      );

      await expect(mgr.launchSubcluster(config)).rejects.toThrow(
        "no registered kernel service 'unknownService'",
      );

      expect(mockIOManager.destroyChannels).toHaveBeenCalledWith('s1');
      expect(mockKernelStore.deleteSubcluster).toHaveBeenCalledWith('s1');
    });

    it('cleans up IO channels and subcluster on vat launch failure', async () => {
      const mockIOManager = {
        createChannels: vi.fn().mockResolvedValue(undefined),
        destroyChannels: vi.fn().mockResolvedValue(undefined),
      };
      const mgr = new SubclusterManager({
        kernelStore: mockKernelStore,
        kernelQueue: mockKernelQueue,
        vatManager: mockVatManager,
        getKernelService: mockGetKernelService,
        queueMessage: mockQueueMessage,
        ioManager: mockIOManager as never,
      });

      mockVatManager.launchVat.mockRejectedValue(new Error('vat boom'));

      const config: ClusterConfig = {
        bootstrap: 'testVat',
        vats: { testVat: { sourceSpec: 'test.js' } },
        io: {
          repl: { type: 'socket', path: '/tmp/repl.sock' },
        },
      };

      await expect(mgr.launchSubcluster(config)).rejects.toThrow('vat boom');

      expect(mockIOManager.destroyChannels).toHaveBeenCalledWith('s1');
      expect(mockKernelStore.deleteSubcluster).toHaveBeenCalledWith('s1');
    });

    it('cleans up subcluster when createChannels fails', async () => {
      const mockIOManager = {
        createChannels: vi
          .fn()
          .mockRejectedValue(new Error('channel creation failed')),
        destroyChannels: vi.fn().mockResolvedValue(undefined),
      };
      const mgr = new SubclusterManager({
        kernelStore: mockKernelStore,
        kernelQueue: mockKernelQueue,
        vatManager: mockVatManager,
        getKernelService: mockGetKernelService,
        queueMessage: mockQueueMessage,
        ioManager: mockIOManager as never,
      });

      const config: ClusterConfig = {
        bootstrap: 'testVat',
        vats: { testVat: { sourceSpec: 'test.js' } },
        io: {
          repl: { type: 'socket', path: '/tmp/repl.sock' },
        },
      };

      await expect(mgr.launchSubcluster(config)).rejects.toThrow(
        'channel creation failed',
      );

      expect(mockIOManager.destroyChannels).toHaveBeenCalledWith('s1');
      expect(mockKernelStore.deleteSubcluster).toHaveBeenCalledWith('s1');
    });

    it('throws when config declares IO but no IO manager is provided', async () => {
      const config: ClusterConfig = {
        bootstrap: 'testVat',
        vats: { testVat: { sourceSpec: 'test.js' } },
        io: {
          repl: { type: 'socket', path: '/tmp/repl.sock' },
        },
      };

      await expect(subclusterManager.launchSubcluster(config)).rejects.toThrow(
        'no IO channel factory was provided',
      );

      expect(mockKernelStore.deleteSubcluster).toHaveBeenCalledWith('s1');
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

  describe('initSystemSubclusters', () => {
    const makeSystemConfig = (name: string): SystemSubclusterConfig => ({
      name,
      config: createMockClusterConfig(name),
    });

    it('validates no duplicate names', () => {
      const configs = [makeSystemConfig('dup'), makeSystemConfig('dup')];

      expect(() => subclusterManager.initSystemSubclusters(configs)).toThrow(
        'Duplicate system subcluster names in config',
      );
    });

    it('accepts configs with no persisted mappings', () => {
      mockKernelStore.getAllSystemSubclusterMappings.mockReturnValue(new Map());

      subclusterManager.initSystemSubclusters([makeSystemConfig('sys1')]);

      expect(mockKernelStore.getAllSystemSubclusterMappings).toHaveBeenCalled();
    });

    it('deletes orphaned system subclusters no longer in config', () => {
      const subcluster = createMockSubcluster('s1', createMockClusterConfig());
      mockKernelStore.getAllSystemSubclusterMappings.mockReturnValue(
        new Map([['orphan', 's1']]),
      );
      mockKernelStore.getSubcluster.mockReturnValue(subcluster);

      // Pass empty configs - the persisted "orphan" is not in config
      subclusterManager.initSystemSubclusters([]);

      expect(mockKernelStore.deleteVatConfig).toHaveBeenCalled();
      expect(mockKernelStore.markVatAsTerminated).toHaveBeenCalled();
      expect(mockKernelStore.deleteSubcluster).toHaveBeenCalledWith('s1');
      expect(
        mockKernelStore.deleteSystemSubclusterMapping,
      ).toHaveBeenCalledWith('orphan');
    });

    it('restores valid persisted system subclusters', () => {
      const config = createMockClusterConfig('sys');
      const subcluster = createMockSubcluster('s1', config);
      mockKernelStore.getAllSystemSubclusterMappings.mockReturnValue(
        new Map([['sys', 's1']]),
      );
      mockKernelStore.getSubcluster.mockReturnValue(subcluster);
      mockKernelStore.getRootObject.mockReturnValue('ko1');

      subclusterManager.initSystemSubclusters([makeSystemConfig('sys')]);

      expect(subclusterManager.getSystemSubclusterRoot('sys')).toBe('ko1');
    });

    it('cleans up mapping when subcluster no longer exists', () => {
      mockKernelStore.getAllSystemSubclusterMappings.mockReturnValue(
        new Map([['sys', 's99']]),
      );
      mockKernelStore.getSubcluster.mockReturnValue(undefined);

      subclusterManager.initSystemSubclusters([makeSystemConfig('sys')]);

      expect(
        mockKernelStore.deleteSystemSubclusterMapping,
      ).toHaveBeenCalledWith('sys');
    });

    it('throws when persisted system subcluster has no bootstrap vat', () => {
      const config = createMockClusterConfig('sys');
      // Subcluster with empty vats - no bootstrap vat
      const subcluster: Subcluster = { id: 's1', config, vats: {} };
      mockKernelStore.getAllSystemSubclusterMappings.mockReturnValue(
        new Map([['sys', 's1']]),
      );
      mockKernelStore.getSubcluster.mockReturnValue(subcluster);

      expect(() =>
        subclusterManager.initSystemSubclusters([makeSystemConfig('sys')]),
      ).toThrow('has no bootstrap vat - database may be corrupted');
    });

    it('throws when persisted system subcluster has no root object', () => {
      const config = createMockClusterConfig('sys');
      const subcluster = createMockSubcluster('s1', config);
      mockKernelStore.getAllSystemSubclusterMappings.mockReturnValue(
        new Map([['sys', 's1']]),
      );
      mockKernelStore.getSubcluster.mockReturnValue(subcluster);
      mockKernelStore.getRootObject.mockReturnValue(undefined);

      expect(() =>
        subclusterManager.initSystemSubclusters([makeSystemConfig('sys')]),
      ).toThrow('has no root object - database may be corrupted');
    });
  });

  describe('launchNewSystemSubclusters', () => {
    const makeSystemConfig = (name: string): SystemSubclusterConfig => ({
      name,
      config: createMockClusterConfig(name),
    });

    it('launches configs not already restored from persistence', async () => {
      // First restore a persisted subcluster
      const config = createMockClusterConfig('existing');
      const subcluster = createMockSubcluster('s1', config);
      mockKernelStore.getAllSystemSubclusterMappings.mockReturnValue(
        new Map([['existing', 's1']]),
      );
      mockKernelStore.getSubcluster.mockReturnValue(subcluster);
      mockKernelStore.getRootObject.mockReturnValue('ko-existing');

      subclusterManager.initSystemSubclusters([
        makeSystemConfig('existing'),
        makeSystemConfig('newOne'),
      ]);

      // Now launch new ones — "existing" should be skipped
      mockKernelStore.addSubcluster.mockReturnValue('s2');
      await subclusterManager.launchNewSystemSubclusters([
        makeSystemConfig('existing'),
        makeSystemConfig('newOne'),
      ]);

      // launchVat should have been called once for the new subcluster
      expect(mockVatManager.launchVat).toHaveBeenCalledOnce();
      expect(mockKernelStore.setSystemSubclusterMapping).toHaveBeenCalledWith(
        'newOne',
        's2',
      );
    });

    it('does nothing when all configs are already restored', async () => {
      const config = createMockClusterConfig('sys');
      const subcluster = createMockSubcluster('s1', config);
      mockKernelStore.getAllSystemSubclusterMappings.mockReturnValue(
        new Map([['sys', 's1']]),
      );
      mockKernelStore.getSubcluster.mockReturnValue(subcluster);
      mockKernelStore.getRootObject.mockReturnValue('ko1');

      subclusterManager.initSystemSubclusters([makeSystemConfig('sys')]);

      await subclusterManager.launchNewSystemSubclusters([
        makeSystemConfig('sys'),
      ]);

      expect(mockVatManager.launchVat).not.toHaveBeenCalled();
    });

    it('persists mappings for newly launched subclusters', async () => {
      mockKernelStore.addSubcluster.mockReturnValue('s1');

      await subclusterManager.launchNewSystemSubclusters([
        makeSystemConfig('newSys'),
      ]);

      expect(mockKernelStore.setSystemSubclusterMapping).toHaveBeenCalledWith(
        'newSys',
        's1',
      );
      expect(subclusterManager.getSystemSubclusterRoot('newSys')).toBe('ko1');
    });
  });

  describe('getSystemSubclusterRoot', () => {
    it('returns kref for a known system subcluster', () => {
      // Set up state via initSystemSubclusters
      const config = createMockClusterConfig('sys');
      const subcluster = createMockSubcluster('s1', config);
      mockKernelStore.getAllSystemSubclusterMappings.mockReturnValue(
        new Map([['sys', 's1']]),
      );
      mockKernelStore.getSubcluster.mockReturnValue(subcluster);
      mockKernelStore.getRootObject.mockReturnValue('ko42');

      subclusterManager.initSystemSubclusters([
        { name: 'sys', config: createMockClusterConfig('sys') },
      ]);

      expect(subclusterManager.getSystemSubclusterRoot('sys')).toBe('ko42');
    });

    it('throws for unknown system subcluster name', () => {
      expect(() =>
        subclusterManager.getSystemSubclusterRoot('unknown'),
      ).toThrow('System subcluster "unknown" not found');
    });
  });

  describe('clearSystemSubclusters', () => {
    it('clears all system subcluster root state', () => {
      // Set up state via initSystemSubclusters
      const config = createMockClusterConfig('sys');
      const subcluster = createMockSubcluster('s1', config);
      mockKernelStore.getAllSystemSubclusterMappings.mockReturnValue(
        new Map([['sys', 's1']]),
      );
      mockKernelStore.getSubcluster.mockReturnValue(subcluster);
      mockKernelStore.getRootObject.mockReturnValue('ko42');

      subclusterManager.initSystemSubclusters([
        { name: 'sys', config: createMockClusterConfig('sys') },
      ]);

      expect(subclusterManager.getSystemSubclusterRoot('sys')).toBe('ko42');

      subclusterManager.clearSystemSubclusters();

      expect(() => subclusterManager.getSystemSubclusterRoot('sys')).toThrow(
        'System subcluster "sys" not found',
      );
    });
  });

  describe('terminateSubcluster with system subcluster mapping', () => {
    it('cleans up system subcluster mapping when terminating a system subcluster', async () => {
      // Set up a system subcluster via init
      const config = createMockClusterConfig('sys');
      const subcluster = createMockSubcluster('s1', config);
      mockKernelStore.getAllSystemSubclusterMappings.mockReturnValue(
        new Map([['sys', 's1']]),
      );
      mockKernelStore.getSubcluster.mockReturnValue(subcluster);
      mockKernelStore.getRootObject.mockReturnValue('ko1');
      mockKernelStore.getSubclusterVats.mockReturnValue([
        'v1',
        'v2',
      ] as VatId[]);

      subclusterManager.initSystemSubclusters([
        { name: 'sys', config: createMockClusterConfig('sys') },
      ]);

      expect(subclusterManager.getSystemSubclusterRoot('sys')).toBe('ko1');

      await subclusterManager.terminateSubcluster('s1');

      expect(
        mockKernelStore.deleteSystemSubclusterMapping,
      ).toHaveBeenCalledWith('sys');
      expect(() => subclusterManager.getSystemSubclusterRoot('sys')).toThrow(
        'System subcluster "sys" not found',
      );
    });

    it('does not clean up mappings for non-system subclusters', async () => {
      const subcluster = createMockSubcluster('s1', createMockClusterConfig());
      mockKernelStore.getSubcluster.mockReturnValue(subcluster);
      mockKernelStore.getSubclusterVats.mockReturnValue([]);
      mockKernelStore.getAllSystemSubclusterMappings.mockReturnValue(new Map());

      await subclusterManager.terminateSubcluster('s1');

      expect(
        mockKernelStore.deleteSystemSubclusterMapping,
      ).not.toHaveBeenCalled();
    });
  });
});
