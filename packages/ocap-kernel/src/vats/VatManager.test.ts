import {
  VatAlreadyExistsError,
  VatDeletedError,
  VatNotFoundError,
} from '@metamask/kernel-errors';
import type { JsonRpcMessage } from '@metamask/kernel-utils';
import { Logger } from '@metamask/logger';
import type { DuplexStream } from '@metamask/streams';
import type { Mocked, MockInstance } from 'vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { KernelQueue } from '../KernelQueue.ts';
import type { KernelStore } from '../store/index.ts';
import type { VatId, VatConfig, PlatformServices } from '../types.ts';
import { VatHandle } from './VatHandle.ts';
import { VatManager } from './VatManager.ts';

describe('VatManager', () => {
  let mockPlatformServices: Mocked<PlatformServices>;
  let mockKernelStore: Mocked<KernelStore>;
  let mockKernelQueue: Mocked<KernelQueue>;
  let mockLogger: Logger;
  let vatManager: VatManager;
  let makeVatHandleMock: MockInstance;
  let vatHandles: Mocked<VatHandle>[];

  const createMockVatConfig = (name = 'test'): VatConfig => ({
    sourceSpec: `${name}.js`,
  });

  const createMockVatHandle = (
    vatId: VatId,
    config: VatConfig,
  ): Mocked<VatHandle> => {
    const handle = {
      vatId,
      config,
      terminate: vi.fn(),
      ping: vi.fn().mockResolvedValue({ pong: true }),
    } as unknown as Mocked<VatHandle>;
    vatHandles.push(handle);
    return handle;
  };

  beforeEach(() => {
    vatHandles = [];

    mockPlatformServices = {
      launch: vi.fn().mockResolvedValue({
        end: vi.fn(),
      } as unknown as DuplexStream<JsonRpcMessage, JsonRpcMessage>),
      terminate: vi.fn().mockResolvedValue(undefined),
      terminateAll: vi.fn().mockResolvedValue(undefined),
    } as unknown as Mocked<PlatformServices>;

    mockKernelStore = {
      getNextVatId: vi
        .fn()
        .mockReturnValueOnce('v1')
        .mockReturnValueOnce('v2')
        .mockReturnValueOnce('v3'),
      initEndpoint: vi.fn(),
      exportFromEndpoint: vi.fn().mockReturnValue('ko1'),
      setVatConfig: vi.fn(),
      addSubclusterVat: vi.fn(),
      getAllVatRecords: vi.fn().mockReturnValue(
        (function* () {
          // Empty generator
        })(),
      ),
      getVatSubcluster: vi.fn().mockReturnValue('s1'),
      isVatActive: vi.fn().mockReturnValue(true),
      markVatAsTerminated: vi.fn(),
      deleteVat: vi.fn(),
      getPromisesByDecider: vi.fn().mockReturnValue([]),
      getRootObject: vi.fn().mockReturnValue('ko1'),
      pinObject: vi.fn(),
      unpinObject: vi.fn(),
      scheduleReap: vi.fn(),
      nextTerminatedVatCleanup: vi.fn().mockReturnValue(false),
      collectGarbage: vi.fn(),
    } as unknown as Mocked<KernelStore>;

    mockKernelQueue = {
      waitForCrank: vi.fn().mockResolvedValue(undefined),
      resolvePromises: vi.fn(),
    } as unknown as Mocked<KernelQueue>;

    mockLogger = new Logger('test');

    makeVatHandleMock = vi
      .spyOn(VatHandle, 'make')
      .mockImplementation(async ({ vatId, vatConfig }) => {
        return createMockVatHandle(vatId, vatConfig);
      });

    vatManager = new VatManager({
      platformServices: mockPlatformServices,
      kernelStore: mockKernelStore,
      kernelQueue: mockKernelQueue,
      logger: mockLogger,
    });
  });

  describe('constructor', () => {
    it('initializes with provided options', () => {
      expect(vatManager).toBeDefined();
      expect(vatManager.getVatIds()).toStrictEqual([]);
    });

    it('uses default logger if not provided', () => {
      const manager = new VatManager({
        platformServices: mockPlatformServices,
        kernelStore: mockKernelStore,
        kernelQueue: mockKernelQueue,
      });
      expect(manager).toBeDefined();
    });
  });

  describe('initializeAllVats', () => {
    it('initializes all vats from storage', async () => {
      const vatRecords = [
        { vatID: 'v1' as VatId, vatConfig: createMockVatConfig('vat1') },
        { vatID: 'v2' as VatId, vatConfig: createMockVatConfig('vat2') },
      ];

      function* mockGenerator() {
        yield* vatRecords;
      }
      mockKernelStore.getAllVatRecords.mockReturnValue(mockGenerator());

      await vatManager.initializeAllVats();

      expect(mockPlatformServices.launch).toHaveBeenCalledTimes(2);
      expect(makeVatHandleMock).toHaveBeenCalledTimes(2);
      expect(vatManager.getVatIds()).toStrictEqual(['v1', 'v2']);
    });

    it('handles empty vat records', async () => {
      mockKernelStore.getAllVatRecords.mockReturnValue(
        (function* () {
          // Empty generator
        })(),
      );
      await vatManager.initializeAllVats();

      expect(mockPlatformServices.launch).not.toHaveBeenCalled();
      expect(vatManager.getVatIds()).toStrictEqual([]);
    });

    describe('a vat whose code can no longer be loaded', () => {
      const MISSING_BUNDLE = 'file:///bundles/gone.bundle';

      /**
       * Persist one healthy vat and one whose code is gone. The two are
       * unrelated: losing the healthy vat because of the other one is the
       * defect under test.
       *
       * @param unrestorableConfig - The config of the vat that cannot be
       * restored. Defaults to one naming a missing bundle.
       */
      const persistOneUnrestorableVat = (
        unrestorableConfig: VatConfig = { bundleSpec: MISSING_BUNDLE },
      ): void => {
        mockKernelStore.getAllVatRecords.mockReturnValue(
          (function* () {
            yield { vatID: 'v1' as VatId, vatConfig: createMockVatConfig() };
            yield { vatID: 'v2' as VatId, vatConfig: unrestorableConfig };
          })(),
        );
      };

      /** Fail `v2` where a worker never comes up at all. */
      const failAtLaunch = (): void => {
        mockPlatformServices.launch.mockImplementation(async (vatId) => {
          if (vatId === 'v2') {
            // `fetchBlob` hands back whatever `fs.readFile` rejected with, so
            // the failure arrives as a Node errno object.
            throw Object.assign(
              new Error(
                `ENOENT: no such file or directory, open '${MISSING_BUNDLE}'`,
              ),
              { code: 'ENOENT', errno: -2, syscall: 'open' },
            );
          }
          return { end: vi.fn() } as unknown as DuplexStream<
            JsonRpcMessage,
            JsonRpcMessage
          >;
        });
      };

      /**
       * Fail `v2` the way production does: the worker starts, and the bundle
       * fetch it performs fails inside the `initVat` delivery.
       */
      const failAfterWorkerIsLive = (): void => {
        makeVatHandleMock.mockImplementation(async ({ vatId, vatConfig }) => {
          if (vatId === 'v2') {
            throw new Error(
              `Failed to initialize vat ${vatId}: ENOENT: no such file or directory, open '${MISSING_BUNDLE}'`,
            );
          }
          return createMockVatHandle(vatId, vatConfig);
        });
      };

      it.each([
        ['before its worker comes up', failAtLaunch],
        ['after its worker is live', failAfterWorkerIsLive],
      ])('restores the other vats when it fails %s', async (_when, fail) => {
        persistOneUnrestorableVat();
        fail();

        await vatManager.initializeAllVats();

        expect(vatManager.getVatIds()).toStrictEqual(['v1']);
      });

      it('reaps the worker left behind by a vat that failed to initialize', async () => {
        persistOneUnrestorableVat();
        failAfterWorkerIsLive();

        await vatManager.initializeAllVats();

        // The worker outlives the failed vat — `VatHandle.make` is reached only
        // once `launch` has resolved — and a worker nobody owns is the wedged
        // process this failure mode is known by.
        expect(mockPlatformServices.terminate).toHaveBeenCalledWith('v2');
        // Only that one: reaping the healthy vat's worker would leave the
        // kernel holding a `VatHandle` for a vat whose worker is dead.
        expect(mockPlatformServices.terminate).toHaveBeenCalledTimes(1);
      });

      it('confines each failure to its own vat when several cannot be restored', async () => {
        // The case that cannot be satisfied by catching around the whole batch:
        // each unrestorable vat has to be reaped and reported on its own, and
        // the healthy one still has to come up.
        mockKernelStore.getAllVatRecords.mockReturnValue(
          (function* () {
            yield { vatID: 'v1' as VatId, vatConfig: createMockVatConfig() };
            yield {
              vatID: 'v2' as VatId,
              vatConfig: { bundleSpec: MISSING_BUNDLE },
            };
            yield {
              vatID: 'v3' as VatId,
              vatConfig: { bundleSpec: 'file:///bundles/also-gone.bundle' },
            };
          })(),
        );
        mockPlatformServices.launch.mockImplementation(async (vatId) => {
          if (vatId === 'v2' || vatId === 'v3') {
            throw new Error(`ENOENT: no such file or directory`);
          }
          return { end: vi.fn() } as unknown as DuplexStream<
            JsonRpcMessage,
            JsonRpcMessage
          >;
        });
        const logErrorSpy = vi.spyOn(mockLogger, 'error');

        await vatManager.initializeAllVats();

        expect(vatManager.getVatIds()).toStrictEqual(['v1']);
        expect(mockPlatformServices.terminate).toHaveBeenCalledWith('v2');
        expect(mockPlatformServices.terminate).toHaveBeenCalledWith('v3');
        const reported = logErrorSpy.mock.calls.map(([message]) =>
          String(message),
        );
        expect(reported.filter((line) => line.includes('vat v2'))).toHaveLength(
          1,
        );
        expect(reported.filter((line) => line.includes('vat v3'))).toHaveLength(
          1,
        );
      });

      it('boots even when the leftover worker cannot be reaped', async () => {
        persistOneUnrestorableVat();
        failAfterWorkerIsLive();
        mockPlatformServices.terminate.mockRejectedValue(
          new Error('No worker found for vatId v2'),
        );

        await vatManager.initializeAllVats();

        expect(vatManager.getVatIds()).toStrictEqual(['v1']);
      });

      it('keeps the vat persisted rather than pruning it', async () => {
        persistOneUnrestorableVat();
        failAtLaunch();

        await vatManager.initializeAllVats();

        // A bundle that is missing now may be present at the next boot, so the
        // vat's record is left alone; discarding persisted state is not a call
        // the restore path gets to make.
        expect(mockKernelStore.markVatAsTerminated).not.toHaveBeenCalled();
      });

      it.each([
        [{ bundleSpec: MISSING_BUNDLE }, `bundleSpec ${MISSING_BUNDLE}`],
        [{ sourceSpec: 'gone.js' }, 'sourceSpec gone.js'],
        [{ bundleName: 'gone' }, 'bundleName gone'],
      ])(
        'names the vat, its subcluster and its code source: %o',
        async (unrestorableConfig, expectedSource) => {
          persistOneUnrestorableVat(unrestorableConfig);
          failAtLaunch();
          const logErrorSpy = vi.spyOn(mockLogger, 'error');

          await vatManager.initializeAllVats();

          expect(logErrorSpy).toHaveBeenCalledWith(
            expect.stringContaining(expectedSource),
            expect.anything(),
          );
          const [message] = logErrorSpy.mock.calls[0] as [string];
          expect(message).toContain('vat v2');
          expect(message).toContain('subcluster s1');
        },
      );

      it('reports a vat that belongs to no subcluster', async () => {
        persistOneUnrestorableVat();
        failAtLaunch();
        mockKernelStore.getVatSubcluster.mockImplementation(() => {
          throw new Error('Vat v2 has no subcluster');
        });
        const logErrorSpy = vi.spyOn(mockLogger, 'error');

        await vatManager.initializeAllVats();

        expect(logErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining('subcluster none'),
          expect.anything(),
        );
      });
    });
  });

  describe('launchVat', () => {
    it('launches a new vat without subcluster', async () => {
      const config = createMockVatConfig();
      const kref = await vatManager.launchVat(config, 'test');

      expect(mockKernelStore.getNextVatId).toHaveBeenCalledOnce();
      expect(mockPlatformServices.launch).toHaveBeenCalledWith('v1', config);
      expect(mockKernelStore.initEndpoint).toHaveBeenCalledWith('v1');
      expect(mockKernelStore.exportFromEndpoint).toHaveBeenCalled();
      expect(mockKernelStore.setVatConfig).toHaveBeenCalledWith('v1', config);
      expect(mockKernelStore.addSubclusterVat).not.toHaveBeenCalled();
      expect(kref).toBe('ko1');
    });

    it('launches a new vat with subcluster', async () => {
      const config = createMockVatConfig();
      const kref = await vatManager.launchVat(config, 'test', 's1');

      expect(mockKernelStore.addSubclusterVat).toHaveBeenCalledWith(
        's1',
        'test',
        'v1',
      );
      expect(kref).toBe('ko1');
    });

    it('attributes a launch failure to the vat by id and config name', async () => {
      const config = createMockVatConfig();
      const cause = new Error(
        'Failed to initialize vat v1: buildRootObject threw',
      );
      makeVatHandleMock.mockRejectedValueOnce(cause);

      await expect(vatManager.launchVat(config, 'bob', 's1')).rejects.toThrow(
        'Failed to launch vat v1 (bob)',
      );

      // Downstream setup is skipped once the launch fails.
      expect(mockKernelStore.initEndpoint).not.toHaveBeenCalled();
      expect(mockKernelStore.setVatConfig).not.toHaveBeenCalled();
    });

    it('preserves the original error as the cause of a launch failure', async () => {
      const config = createMockVatConfig();
      const cause = new Error('buildRootObject threw');
      makeVatHandleMock.mockRejectedValueOnce(cause);

      const error = await vatManager
        .launchVat(config, 'bob', 's1')
        .catch((reason: unknown) => reason);

      expect((error as Error).cause).toBe(cause);
    });
  });

  describe('runVat', () => {
    it('runs a new vat successfully', async () => {
      const config = createMockVatConfig();
      await vatManager.runVat('v1', config);

      expect(mockPlatformServices.launch).toHaveBeenCalledWith('v1', config);
      expect(makeVatHandleMock).toHaveBeenCalledOnce();
      expect(vatManager.hasVat('v1')).toBe(true);
    });

    it('throws if vat already exists', async () => {
      const config = createMockVatConfig();
      await vatManager.runVat('v1', config);

      await expect(vatManager.runVat('v1', config)).rejects.toThrow(
        VatAlreadyExistsError,
      );
    });
  });

  describe('stopVat', () => {
    it('stops a vat for restart', async () => {
      const config = createMockVatConfig();
      await vatManager.runVat('v1', config);

      await vatManager.stopVat('v1', false);

      expect(mockPlatformServices.terminate).toHaveBeenCalledWith(
        'v1',
        undefined,
      );
      expect(vatHandles[0]?.terminate).toHaveBeenCalledWith(false, undefined);
      expect(vatManager.hasVat('v1')).toBe(false);
    });

    it('stops a vat for termination with reason', async () => {
      const config = createMockVatConfig();
      await vatManager.runVat('v1', config);
      const reason = { body: 'Test termination', slots: [] };

      await vatManager.stopVat('v1', true, reason);

      expect(mockPlatformServices.terminate).toHaveBeenCalledWith(
        'v1',
        expect.objectContaining({
          message: 'Vat termination: Test termination',
        }),
      );
      expect(vatHandles[0]?.terminate).toHaveBeenCalledWith(
        true,
        expect.objectContaining({
          message: 'Vat termination: Test termination',
        }),
      );
    });

    it('stops a vat for termination without reason', async () => {
      const config = createMockVatConfig();
      await vatManager.runVat('v1', config);

      await vatManager.stopVat('v1', true);

      expect(mockPlatformServices.terminate).toHaveBeenCalledWith(
        'v1',
        expect.any(VatDeletedError),
      );
      expect(vatHandles[0]?.terminate).toHaveBeenCalledWith(
        true,
        expect.any(VatDeletedError),
      );
    });

    it('throws if vat not found', async () => {
      await expect(vatManager.stopVat('v1', false)).rejects.toThrow(
        VatNotFoundError,
      );
    });

    it('continues even if platform terminate fails', async () => {
      const config = createMockVatConfig();
      await vatManager.runVat('v1', config);
      mockPlatformServices.terminate.mockRejectedValueOnce(
        new Error('Platform error'),
      );

      await vatManager.stopVat('v1', false);

      expect(vatHandles[0]?.terminate).toHaveBeenCalled();
      expect(vatManager.hasVat('v1')).toBe(false);
    });
  });

  describe('terminateVat', () => {
    it('terminates a vat successfully', async () => {
      const config = createMockVatConfig();
      await vatManager.runVat('v1', config);

      await vatManager.terminateVat('v1');

      expect(mockKernelQueue.waitForCrank).toHaveBeenCalled();
      expect(mockPlatformServices.terminate).toHaveBeenCalled();
      expect(vatHandles[0]?.terminate).toHaveBeenCalled();
      expect(mockKernelStore.markVatAsTerminated).toHaveBeenCalledWith('v1');
      expect(vatManager.hasVat('v1')).toBe(false);
    });

    it('terminates a vat with reason', async () => {
      const config = createMockVatConfig();
      await vatManager.runVat('v1', config);
      const reason = { body: 'Custom reason', slots: [] };

      await vatManager.terminateVat('v1', reason);

      expect(mockPlatformServices.terminate).toHaveBeenCalledWith(
        'v1',
        expect.objectContaining({ message: 'Vat termination: Custom reason' }),
      );
    });

    it('retires a persisted vat that is not running', async () => {
      // A vat skipped at boot has no worker to stop, but must still be
      // retirable — otherwise the only way to be rid of one is to discard the
      // whole store, and terminating its subcluster strands half-done.
      await vatManager.terminateVat('v2');

      expect(mockPlatformServices.terminate).not.toHaveBeenCalled();
      expect(mockKernelStore.markVatAsTerminated).toHaveBeenCalledWith('v2');
    });

    it('discards the persisted record of a vat that is not running', async () => {
      // `markVatAsTerminated` alone does not retire a vat. The deferred cleanup
      // it schedules walks keys prefixed `${vatId}.`, which never matches
      // `vatConfig.${vatId}` — only `deleteVat` removes that, along with the
      // vat's own store and its subcluster membership. Leave it behind and the
      // next boot restores the vat the operator just terminated.
      await vatManager.terminateVat('v2');

      expect(mockKernelStore.deleteVat).toHaveBeenCalledWith('v2');
    });

    it('rejects the promises a vat that is not running was deciding', async () => {
      mockKernelStore.getPromisesByDecider.mockReturnValue(['kp1', 'kp2']);

      await vatManager.terminateVat('v2');

      // `cleanupTerminatedVat` deletes these promises' c-list entries and drops
      // the decider's refcount on the stated understanding that its caller has
      // already rejected them. Nothing else can: a promise left unresolved with
      // a decider that no longer exists hangs its waiters for good.
      expect(mockKernelQueue.resolvePromises).toHaveBeenCalledWith('v2', [
        ['kp1', true, expect.anything()],
      ]);
      expect(mockKernelQueue.resolvePromises).toHaveBeenCalledWith('v2', [
        ['kp2', true, expect.anything()],
      ]);
    });

    it('carries the termination reason into those rejections', async () => {
      mockKernelStore.getPromisesByDecider.mockReturnValue(['kp1']);

      await vatManager.terminateVat('v2', { body: 'Custom reason', slots: [] });

      const [, resolutions] = mockKernelQueue.resolvePromises.mock.calls[0] as [
        string,
        [string, boolean, { body: string }][],
      ];
      expect(resolutions[0]?.[2]?.body).toContain('Custom reason');
    });

    it('throws for a vat that is neither running nor persisted', async () => {
      mockKernelStore.isVatActive.mockReturnValue(false);

      await expect(vatManager.terminateVat('v9')).rejects.toThrow(
        VatNotFoundError,
      );
      expect(mockKernelStore.markVatAsTerminated).not.toHaveBeenCalled();
    });
  });

  describe('restartVat', () => {
    it('restarts a vat successfully', async () => {
      const config = createMockVatConfig();
      await vatManager.runVat('v1', config);
      const originalHandle = vatHandles[0];

      const result = await vatManager.restartVat('v1');

      expect(mockKernelQueue.waitForCrank).toHaveBeenCalled();
      expect(originalHandle?.terminate).toHaveBeenCalledWith(false, undefined);
      expect(mockPlatformServices.launch).toHaveBeenCalledTimes(2);
      expect(makeVatHandleMock).toHaveBeenCalledTimes(2);
      expect(result).not.toBe(originalHandle);
      expect(result).toBe(vatHandles[1]);
      expect(vatManager.hasVat('v1')).toBe(true);
    });

    it('throws if vat not found', async () => {
      await expect(vatManager.restartVat('v1')).rejects.toThrow(
        VatNotFoundError,
      );
    });
  });

  describe('pingVat', () => {
    it('pings a vat successfully', async () => {
      const config = createMockVatConfig();
      await vatManager.runVat('v1', config);

      const result = await vatManager.pingVat('v1');

      expect(vatHandles[0]?.ping).toHaveBeenCalled();
      expect(result).toStrictEqual({ pong: true });
    });

    it('throws if vat not found', async () => {
      await expect(vatManager.pingVat('v1')).rejects.toThrow(VatNotFoundError);
    });
  });

  describe('getVat', () => {
    it('returns vat handle if exists', async () => {
      const config = createMockVatConfig();
      await vatManager.runVat('v1', config);

      const vat = vatManager.getVat('v1');

      expect(vat).toBe(vatHandles[0]);
    });

    it('throws if vat not found', () => {
      expect(() => vatManager.getVat('v1')).toThrow(VatNotFoundError);
    });
  });

  describe('hasVat', () => {
    it('returns true if vat exists', async () => {
      const config = createMockVatConfig();
      await vatManager.runVat('v1', config);

      expect(vatManager.hasVat('v1')).toBe(true);
    });

    it('returns false if vat does not exist', () => {
      expect(vatManager.hasVat('v1')).toBe(false);
    });
  });

  describe('getVatIds', () => {
    it('returns empty array initially', () => {
      expect(vatManager.getVatIds()).toStrictEqual([]);
    });

    it('returns array of vat IDs', async () => {
      await vatManager.runVat('v1', createMockVatConfig());
      await vatManager.runVat('v2', createMockVatConfig());

      expect(vatManager.getVatIds()).toStrictEqual(['v1', 'v2']);
    });
  });

  describe('getVats', () => {
    it('returns empty array initially', () => {
      expect(vatManager.getVats()).toStrictEqual([]);
    });

    it('returns array of vat information', async () => {
      const config1 = createMockVatConfig('vat1');
      const config2 = createMockVatConfig('vat2');
      await vatManager.runVat('v1', config1);
      await vatManager.runVat('v2', config2);

      const vats = vatManager.getVats();

      expect(vats).toHaveLength(2);
      expect(vats[0]).toStrictEqual({
        id: 'v1',
        config: config1,
        subclusterId: 's1',
      });
      expect(vats[1]).toStrictEqual({
        id: 'v2',
        config: config2,
        subclusterId: 's1',
      });
    });
  });

  describe('pinVatRoot', () => {
    it('pins vat root successfully', async () => {
      const config = createMockVatConfig();
      await vatManager.runVat('v1', config);

      const kref = vatManager.pinVatRoot('v1');

      expect(mockKernelStore.getRootObject).toHaveBeenCalledWith('v1');
      expect(mockKernelStore.pinObject).toHaveBeenCalledWith('ko1');
      expect(kref).toBe('ko1');
    });

    it('throws if vat not found', () => {
      mockKernelStore.getRootObject.mockReturnValue(undefined);
      expect(() => vatManager.pinVatRoot('v1')).toThrow(VatNotFoundError);
    });
  });

  describe('unpinVatRoot', () => {
    it('unpins vat root successfully', async () => {
      const config = createMockVatConfig();
      await vatManager.runVat('v1', config);

      vatManager.unpinVatRoot('v1');

      expect(mockKernelStore.getRootObject).toHaveBeenCalledWith('v1');
      expect(mockKernelStore.unpinObject).toHaveBeenCalledWith('ko1');
    });

    it('throws if vat not found', () => {
      mockKernelStore.getRootObject.mockReturnValue(undefined);
      expect(() => vatManager.unpinVatRoot('v1')).toThrow(VatNotFoundError);
    });
  });

  describe('reapVats', () => {
    it('reaps all vats with default filter', async () => {
      await vatManager.runVat('v1', createMockVatConfig());
      await vatManager.runVat('v2', createMockVatConfig());

      vatManager.reapVats();

      expect(mockKernelStore.scheduleReap).toHaveBeenCalledWith('v1');
      expect(mockKernelStore.scheduleReap).toHaveBeenCalledWith('v2');
    });

    it('reaps vats matching filter', async () => {
      await vatManager.runVat('v1', createMockVatConfig());
      await vatManager.runVat('v2', createMockVatConfig());

      vatManager.reapVats((vatId) => vatId === 'v1');

      expect(mockKernelStore.scheduleReap).toHaveBeenCalledWith('v1');
      expect(mockKernelStore.scheduleReap).not.toHaveBeenCalledWith('v2');
    });

    it('does nothing with no vats', () => {
      vatManager.reapVats();

      expect(mockKernelStore.scheduleReap).not.toHaveBeenCalled();
    });
  });

  describe('terminateAllVats', () => {
    it('terminates all vats in reverse order', async () => {
      await vatManager.runVat('v1', createMockVatConfig());
      await vatManager.runVat('v2', createMockVatConfig());

      await vatManager.terminateAllVats();

      expect(mockKernelQueue.waitForCrank).toHaveBeenCalled();
      expect(vatHandles[1]?.terminate).toHaveBeenCalled();
      expect(vatHandles[0]?.terminate).toHaveBeenCalled();
      expect(mockKernelStore.markVatAsTerminated).toHaveBeenCalledWith('v2');
      expect(mockKernelStore.markVatAsTerminated).toHaveBeenCalledWith('v1');
      expect(mockKernelStore.collectGarbage).toHaveBeenCalledTimes(2);
      expect(vatManager.getVatIds()).toStrictEqual([]);
    });

    it('handles empty vat list', async () => {
      await vatManager.terminateAllVats();

      expect(mockKernelQueue.waitForCrank).toHaveBeenCalled();
      expect(mockKernelStore.markVatAsTerminated).not.toHaveBeenCalled();
    });
  });

  describe('collectGarbage', () => {
    it('collects garbage until cleanup is done', () => {
      mockKernelStore.nextTerminatedVatCleanup
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false);

      vatManager.collectGarbage();

      expect(mockKernelStore.nextTerminatedVatCleanup).toHaveBeenCalledTimes(3);
      expect(mockKernelStore.collectGarbage).toHaveBeenCalledOnce();
    });

    it('collects garbage when no cleanup needed', () => {
      mockKernelStore.nextTerminatedVatCleanup.mockReturnValue(false);

      vatManager.collectGarbage();

      expect(mockKernelStore.nextTerminatedVatCleanup).toHaveBeenCalledOnce();
      expect(mockKernelStore.collectGarbage).toHaveBeenCalledOnce();
    });
  });
});
