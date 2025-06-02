import { VatNotFoundError } from '@metamask/kernel-errors';
import type { KernelDatabase } from '@metamask/kernel-store';
import type { JsonRpcMessage } from '@metamask/kernel-utils';
import type { DuplexStream } from '@metamask/streams';
import type { JsonRpcResponse, JsonRpcRequest } from '@metamask/utils';
import { TestDuplexStream } from '@ocap/test-utils/streams';
import type { Mocked, MockInstance } from 'vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { Kernel } from './Kernel.ts';
import type {
  VatId,
  VatConfig,
  VatWorkerService,
  ClusterConfig,
} from './types.ts';
import { VatHandle } from './VatHandle.ts';
import { makeMapKernelDatabase } from '../test/storage.ts';

const mocks = vi.hoisted(() => {
  class KernelQueue {
    static lastInstance: KernelQueue;

    enqueueMessage = vi
      .fn()
      .mockResolvedValue({ body: '{"result":"ok"}', slots: [] });

    run = vi.fn().mockResolvedValue(undefined);

    constructor() {
      (this.constructor as typeof KernelQueue).lastInstance = this;
    }
  }
  return { KernelQueue };
});
vi.mock('./KernelQueue.ts', () => {
  return { KernelQueue: mocks.KernelQueue };
});

const makeMockVatConfig = (): VatConfig => ({
  sourceSpec: 'not-really-there.js',
});
const makeMockClusterConfig = (): ClusterConfig => ({
  bootstrap: 'alice',
  vats: {
    alice: {
      bundleSpec: 'http://localhost:3000/sample-vat.bundle',
      parameters: {
        name: 'Alice',
      },
    },
  },
});

describe('Kernel', () => {
  let mockStream: DuplexStream<JsonRpcRequest, JsonRpcResponse>;
  let mockWorkerService: VatWorkerService;
  let launchWorkerMock: MockInstance;
  let terminateWorkerMock: MockInstance;
  let makeVatHandleMock: MockInstance;
  let vatHandles: Mocked<VatHandle>[];
  let mockKernelDatabase: KernelDatabase;

  beforeEach(async () => {
    const dummyDispatch = vi.fn();
    mockStream = await TestDuplexStream.make<JsonRpcRequest, JsonRpcResponse>(
      dummyDispatch,
    );

    mockWorkerService = {
      launch: async () =>
        ({}) as unknown as DuplexStream<JsonRpcMessage, JsonRpcMessage>,
      terminate: async () => undefined,
      terminateAll: async () => undefined,
    } as unknown as VatWorkerService;

    launchWorkerMock = vi
      .spyOn(mockWorkerService, 'launch')
      .mockResolvedValue({ end: vi.fn() } as unknown as DuplexStream<
        JsonRpcMessage,
        JsonRpcMessage
      >);
    terminateWorkerMock = vi
      .spyOn(mockWorkerService, 'terminate')
      .mockResolvedValue(undefined);

    vatHandles = [];
    makeVatHandleMock = vi
      .spyOn(VatHandle, 'make')
      .mockImplementation(async ({ vatId, vatConfig }) => {
        const vatHandle = {
          vatId,
          config: vatConfig,
          init: vi.fn(),
          terminate: vi.fn(),
          handleMessage: vi.fn(),
          deliverMessage: vi.fn(),
          deliverNotify: vi.fn(),
          sendVatCommand: vi.fn(),
          ping: vi.fn(),
        } as unknown as VatHandle;
        vatHandles.push(vatHandle as Mocked<VatHandle>);
        return vatHandle;
      });

    mockKernelDatabase = makeMapKernelDatabase();
  });

  describe('constructor()', () => {
    it('initializes the kernel without errors', async () => {
      expect(
        async () =>
          await Kernel.make(mockStream, mockWorkerService, mockKernelDatabase),
      ).not.toThrow();
    });

    it('honors resetStorage option and clears persistent state', async () => {
      const db = makeMapKernelDatabase();
      db.kernelKVStore.set('foo', 'bar');
      // Create with resetStorage should clear existing keys
      await Kernel.make(mockStream, mockWorkerService, db, {
        resetStorage: true,
      });
      expect(db.kernelKVStore.get('foo')).toBeUndefined();
    });
  });

  describe('init()', () => {
    it('initializes the kernel store', async () => {
      const kernel = await Kernel.make(
        mockStream,
        mockWorkerService,
        mockKernelDatabase,
      );
      await kernel.launchVat(makeMockVatConfig());
      expect(kernel.getVatIds()).toStrictEqual(['v1']);
    });

    it('starts receiving messages', async () => {
      let drainHandler: ((message: JsonRpcRequest) => Promise<void>) | null =
        null;
      const customMockStream = {
        drain: async (handler: (message: JsonRpcRequest) => Promise<void>) => {
          drainHandler = handler;
          return Promise.resolve();
        },
        write: vi.fn().mockResolvedValue(undefined),
      } as unknown as DuplexStream<JsonRpcRequest, JsonRpcResponse>;
      await Kernel.make(
        customMockStream,
        mockWorkerService,
        mockKernelDatabase,
      );
      expect(drainHandler).toBeInstanceOf(Function);
    });

    it('initializes and starts the kernel queue', async () => {
      await Kernel.make(mockStream, mockWorkerService, mockKernelDatabase);
      const queueInstance = mocks.KernelQueue.lastInstance;
      expect(queueInstance.run).toHaveBeenCalledTimes(1);
    });

    it('throws if the stream throws', async () => {
      const streamError = new Error('Stream error');
      const throwingMockStream = {
        drain: () => {
          throw streamError;
        },
        write: vi.fn().mockResolvedValue(undefined),
      } as unknown as DuplexStream<JsonRpcRequest, JsonRpcResponse>;
      await expect(
        Kernel.make(throwingMockStream, mockWorkerService, mockKernelDatabase),
      ).rejects.toThrow('Stream error');
    });

    it('recovers vats from persistent storage on startup', async () => {
      const db = makeMapKernelDatabase();
      // Launch initial kernel and vat
      const kernel1 = await Kernel.make(mockStream, mockWorkerService, db);
      await kernel1.launchVat(makeMockVatConfig());
      expect(kernel1.getVatIds()).toStrictEqual(['v1']);
      // Clear spies
      launchWorkerMock.mockClear();
      makeVatHandleMock.mockClear();
      // New kernel should recover existing vat
      const kernel2 = await Kernel.make(mockStream, mockWorkerService, db);
      expect(launchWorkerMock).toHaveBeenCalledTimes(1);
      expect(makeVatHandleMock).toHaveBeenCalledTimes(1);
      expect(kernel2.getVatIds()).toStrictEqual(['v1']);
    });
  });

  describe('reload()', () => {
    it('should reload all subclusters', async () => {
      const kernel = await Kernel.make(
        mockStream,
        mockWorkerService,
        mockKernelDatabase,
      );
      const config = makeMockClusterConfig();
      await kernel.launchSubcluster(config);
      const { subclusters } = kernel.getStatus();
      expect(subclusters).toHaveLength(1);
      const [firstSubcluster] = subclusters;
      expect(firstSubcluster).toBeDefined();
      await kernel.reload();
      // Verify the old vat was terminated
      expect(vatHandles[0]?.terminate).toHaveBeenCalledTimes(1);
      // Initial + reload
      expect(launchWorkerMock).toHaveBeenCalledTimes(2);
    });

    it('should handle empty subclusters gracefully', async () => {
      const kernel = await Kernel.make(
        mockStream,
        mockWorkerService,
        mockKernelDatabase,
      );
      const result = await kernel.reload();
      expect(result).toBeUndefined();
    });
  });

  describe('queueMessage()', () => {
    it('enqueues a message and returns the result', async () => {
      const kernel = await Kernel.make(
        mockStream,
        mockWorkerService,
        mockKernelDatabase,
      );
      await kernel.launchVat(makeMockVatConfig());
      const result = await kernel.queueMessage('ko1', 'hello', []);
      expect(result).toStrictEqual({ body: '{"result":"ok"}', slots: [] });
    });
  });

  describe('launchSubcluster()', () => {
    it('launches a subcluster according to config', async () => {
      const kernel = await Kernel.make(
        mockStream,
        mockWorkerService,
        mockKernelDatabase,
      );
      const config = makeMockClusterConfig();
      await kernel.launchSubcluster(config);
      expect(launchWorkerMock).toHaveBeenCalled();
      expect(makeVatHandleMock).toHaveBeenCalled();
      const status = kernel.getStatus();
      expect(status.subclusters).toHaveLength(1);
      expect(status.subclusters[0]?.config).toStrictEqual(config);
    });

    it('throws an error for invalid configs', async () => {
      const kernel = await Kernel.make(
        mockStream,
        mockWorkerService,
        mockKernelDatabase,
      );
      // @ts-expect-error Intentionally passing invalid config
      await expect(kernel.launchSubcluster({})).rejects.toThrow(
        'invalid cluster config',
      );
    });

    it('throws an error when bootstrap vat name is invalid', async () => {
      const kernel = await Kernel.make(
        mockStream,
        mockWorkerService,
        mockKernelDatabase,
      );
      const invalidConfig = {
        bootstrap: 'nonexistent',
        vats: {
          alice: {
            sourceSpec: 'test.js',
          },
        },
      };
      await expect(kernel.launchSubcluster(invalidConfig)).rejects.toThrow(
        'invalid bootstrap vat name',
      );
    });

    it('returns the bootstrap message result when bootstrap vat is specified', async () => {
      const kernel = await Kernel.make(
        mockStream,
        mockWorkerService,
        mockKernelDatabase,
      );
      const config = makeMockClusterConfig();
      const result = await kernel.launchSubcluster(config);
      expect(result).toStrictEqual({ body: '{"result":"ok"}', slots: [] });
    });
  });

  describe('terminateSubcluster()', () => {
    it('terminates all vats in a subcluster', async () => {
      const kernel = await Kernel.make(
        mockStream,
        mockWorkerService,
        mockKernelDatabase,
      );
      const config = {
        bootstrap: 'alice',
        vats: {
          alice: { sourceSpec: 'alice.js' },
          bob: { sourceSpec: 'bob.js' },
        },
      };
      await kernel.launchSubcluster(config);
      const { subclusters } = kernel.getStatus();
      const [firstSubcluster] = subclusters;
      expect(firstSubcluster).toBeDefined();
      const subclusterId = firstSubcluster?.id as string;
      expect(subclusterId).toBeDefined();
      await kernel.terminateSubcluster(subclusterId);
      expect(terminateWorkerMock).toHaveBeenCalledTimes(2);
      expect(kernel.getVatIds()).toStrictEqual([]);
      expect(kernel.getSubcluster(subclusterId)).toBeUndefined();
    });

    it('throws when terminating non-existent subcluster', async () => {
      const kernel = await Kernel.make(
        mockStream,
        mockWorkerService,
        mockKernelDatabase,
      );
      await expect(kernel.terminateSubcluster('non-existent')).rejects.toThrow(
        'Subcluster does not exist.',
      );
    });
  });

  describe('getSubcluster()', () => {
    it('returns subcluster by id', async () => {
      const kernel = await Kernel.make(
        mockStream,
        mockWorkerService,
        mockKernelDatabase,
      );
      const config = makeMockClusterConfig();
      await kernel.launchSubcluster(config);
      const { subclusters } = kernel.getStatus();
      const [firstSubcluster] = subclusters;
      expect(firstSubcluster).toBeDefined();
      const subclusterId = firstSubcluster?.id as string;
      expect(subclusterId).toBeDefined();
      const subcluster = kernel.getSubcluster(subclusterId);
      expect(subcluster).toBeDefined();
      expect(subcluster?.config).toStrictEqual(config);
    });

    it('returns undefined for non-existent subcluster', async () => {
      const kernel = await Kernel.make(
        mockStream,
        mockWorkerService,
        mockKernelDatabase,
      );
      expect(kernel.getSubcluster('non-existent')).toBeUndefined();
    });
  });

  describe('isVatInSubcluster()', () => {
    it('correctly identifies vat membership in subcluster', async () => {
      const kernel = await Kernel.make(
        mockStream,
        mockWorkerService,
        mockKernelDatabase,
      );
      const config = makeMockClusterConfig();
      await kernel.launchSubcluster(config);
      const { subclusters } = kernel.getStatus();
      const [firstSubcluster] = subclusters;
      expect(firstSubcluster).toBeDefined();
      const subclusterId = firstSubcluster?.id as string;
      expect(subclusterId).toBeDefined();
      expect(kernel.isVatInSubcluster('v1', subclusterId)).toBe(true);
      expect(kernel.isVatInSubcluster('v1', 'other-subcluster')).toBe(false);
    });
  });

  describe('getSubclusterVats()', () => {
    it('returns all vat IDs in a subcluster', async () => {
      const kernel = await Kernel.make(
        mockStream,
        mockWorkerService,
        mockKernelDatabase,
      );
      const config = {
        bootstrap: 'alice',
        vats: {
          alice: { sourceSpec: 'alice.js' },
          bob: { sourceSpec: 'bob.js' },
        },
      };
      await kernel.launchSubcluster(config);
      const { subclusters } = kernel.getStatus();
      const [firstSubcluster] = subclusters;
      expect(firstSubcluster).toBeDefined();
      const subclusterId = firstSubcluster?.id as string;
      expect(subclusterId).toBeDefined();
      const vatIds = kernel.getSubclusterVats(subclusterId);
      expect(vatIds).toStrictEqual(['v1', 'v2']);
    });
  });

  describe('reloadSubcluster()', () => {
    it('reloads a specific subcluster', async () => {
      const kernel = await Kernel.make(
        mockStream,
        mockWorkerService,
        mockKernelDatabase,
      );
      const config = makeMockClusterConfig();
      await kernel.launchSubcluster(config);
      const { subclusters } = kernel.getStatus();
      const [firstSubcluster] = subclusters;
      expect(firstSubcluster).toBeDefined();
      const subclusterId = firstSubcluster?.id as string;
      expect(subclusterId).toBeDefined();
      await kernel.reloadSubcluster(subclusterId);
      expect(terminateWorkerMock).toHaveBeenCalledOnce();
      expect(launchWorkerMock).toHaveBeenCalledTimes(2); // initial + reload
    });

    it('throws when reloading non-existent subcluster', async () => {
      const kernel = await Kernel.make(
        mockStream,
        mockWorkerService,
        mockKernelDatabase,
      );
      await expect(kernel.reloadSubcluster('non-existent')).rejects.toThrow(
        'Subcluster does not exist.',
      );
    });
  });

  describe('clearStorage()', () => {
    it('clears the kernel storage', async () => {
      const kernel = await Kernel.make(
        mockStream,
        mockWorkerService,
        mockKernelDatabase,
      );
      const clearSpy = vi.spyOn(mockKernelDatabase, 'clear');
      await kernel.clearStorage();
      expect(clearSpy).toHaveBeenCalledOnce();
    });
  });

  describe('getVats()', () => {
    it('returns an empty array when no vats are added', async () => {
      const kernel = await Kernel.make(
        mockStream,
        mockWorkerService,
        mockKernelDatabase,
      );
      expect(kernel.getVats()).toStrictEqual([]);
    });

    it('returns vat information after adding vats', async () => {
      const kernel = await Kernel.make(
        mockStream,
        mockWorkerService,
        mockKernelDatabase,
      );
      const config = makeMockVatConfig();
      await kernel.launchVat(config);
      const vats = kernel.getVats();
      expect(vats).toHaveLength(1);
      expect(vats).toStrictEqual([
        {
          id: 'v1',
          config,
        },
      ]);
    });

    it('includes subcluster information for vats in subclusters', async () => {
      const kernel = await Kernel.make(
        mockStream,
        mockWorkerService,
        mockKernelDatabase,
      );
      const config = makeMockClusterConfig();
      await kernel.launchSubcluster(config);
      const { subclusters } = kernel.getStatus();
      const [firstSubcluster] = subclusters;
      const subclusterId = firstSubcluster?.id;

      const vats = kernel.getVats();
      expect(vats).toHaveLength(1);
      expect(vats[0]?.subclusterId).toBe(subclusterId);
    });
  });

  describe('getVatIds()', () => {
    it('returns an empty array when no vats are added', async () => {
      const kernel = await Kernel.make(
        mockStream,
        mockWorkerService,
        mockKernelDatabase,
      );
      expect(kernel.getVatIds()).toStrictEqual([]);
    });

    it('returns the vat IDs after adding a vat', async () => {
      const kernel = await Kernel.make(
        mockStream,
        mockWorkerService,
        mockKernelDatabase,
      );
      await kernel.launchVat(makeMockVatConfig());
      expect(kernel.getVatIds()).toStrictEqual(['v1']);
    });

    it('returns multiple vat IDs after adding multiple vats', async () => {
      const kernel = await Kernel.make(
        mockStream,
        mockWorkerService,
        mockKernelDatabase,
      );
      await kernel.launchVat(makeMockVatConfig());
      await kernel.launchVat(makeMockVatConfig());
      expect(kernel.getVatIds()).toStrictEqual(['v1', 'v2']);
    });
  });

  describe('getStatus()', () => {
    it('returns the current kernel status', async () => {
      const kernel = await Kernel.make(
        mockStream,
        mockWorkerService,
        mockKernelDatabase,
      );
      const status = kernel.getStatus();
      expect(status).toStrictEqual({
        vats: [],
        subclusters: [],
      });
    });

    it('includes vats and subclusters in status', async () => {
      const kernel = await Kernel.make(
        mockStream,
        mockWorkerService,
        mockKernelDatabase,
      );
      const config = makeMockClusterConfig();
      await kernel.launchSubcluster(config);
      const status = kernel.getStatus();
      expect(status.vats).toHaveLength(1);
      expect(status.subclusters).toHaveLength(1);
      expect(status.subclusters[0]?.config).toStrictEqual(config);
    });
  });

  describe('launchVat()', () => {
    it('adds a vat to the kernel without errors when no vat with the same ID exists', async () => {
      const kernel = await Kernel.make(
        mockStream,
        mockWorkerService,
        mockKernelDatabase,
      );
      await kernel.launchVat(makeMockVatConfig());
      expect(makeVatHandleMock).toHaveBeenCalledOnce();
      expect(launchWorkerMock).toHaveBeenCalled();
      expect(kernel.getVatIds()).toStrictEqual(['v1']);
    });

    it('adds multiple vats to the kernel without errors when no vat with the same ID exists', async () => {
      const kernel = await Kernel.make(
        mockStream,
        mockWorkerService,
        mockKernelDatabase,
      );
      await kernel.launchVat(makeMockVatConfig());
      await kernel.launchVat(makeMockVatConfig());
      expect(makeVatHandleMock).toHaveBeenCalledTimes(2);
      expect(launchWorkerMock).toHaveBeenCalledTimes(2);
      expect(kernel.getVatIds()).toStrictEqual(['v1', 'v2']);
    });

    it('can launch vat with subclusterId', async () => {
      const kernel = await Kernel.make(
        mockStream,
        mockWorkerService,
        mockKernelDatabase,
      );
      const config = makeMockClusterConfig();
      await kernel.launchSubcluster(config);
      const { subclusters } = kernel.getStatus();
      const [firstSubcluster] = subclusters;
      expect(firstSubcluster).toBeDefined();
      const subclusterId = firstSubcluster?.id as string;
      expect(subclusterId).toBeDefined();
      // Launch another vat in the same subcluster
      await kernel.launchVat(makeMockVatConfig(), subclusterId);
      expect(kernel.isVatInSubcluster('v2', subclusterId)).toBe(true);
    });
  });

  describe('terminateVat()', () => {
    it('deletes a vat from the kernel without errors when the vat exists', async () => {
      const kernel = await Kernel.make(
        mockStream,
        mockWorkerService,
        mockKernelDatabase,
      );
      await kernel.launchVat(makeMockVatConfig());
      expect(kernel.getVatIds()).toStrictEqual(['v1']);
      await kernel.terminateVat('v1');
      expect(vatHandles[0]?.terminate).toHaveBeenCalledOnce();
      expect(terminateWorkerMock).toHaveBeenCalledOnce();
      expect(kernel.getVatIds()).toStrictEqual([]);
    });

    it('throws an error when deleting a vat that does not exist in the kernel', async () => {
      const kernel = await Kernel.make(
        mockStream,
        mockWorkerService,
        mockKernelDatabase,
      );
      const nonExistentVatId: VatId = 'v9';
      await expect(async () =>
        kernel.terminateVat(nonExistentVatId),
      ).rejects.toThrow(VatNotFoundError);
      expect(vatHandles).toHaveLength(0);
    });

    it('throws an error when a vat terminate method throws', async () => {
      const kernel = await Kernel.make(
        mockStream,
        mockWorkerService,
        mockKernelDatabase,
      );
      await kernel.launchVat(makeMockVatConfig());
      vatHandles[0]?.terminate.mockRejectedValueOnce('Test error');
      await expect(async () => kernel.terminateVat('v1')).rejects.toThrow(
        'Test error',
      );
    });
  });

  describe('terminateAllVats()', () => {
    it('deletes all vats from the kernel without errors', async () => {
      const workerTerminateMock = vi
        .spyOn(mockWorkerService, 'terminate')
        .mockResolvedValue(undefined);
      const kernel = await Kernel.make(
        mockStream,
        mockWorkerService,
        mockKernelDatabase,
      );
      await kernel.launchVat(makeMockVatConfig());
      await kernel.launchVat(makeMockVatConfig());
      expect(kernel.getVatIds()).toStrictEqual(['v1', 'v2']);
      expect(vatHandles).toHaveLength(2);
      await kernel.terminateAllVats();
      expect(vatHandles[0]?.terminate).toHaveBeenCalledOnce();
      expect(vatHandles[1]?.terminate).toHaveBeenCalledOnce();
      expect(workerTerminateMock).toHaveBeenCalledTimes(2);
      expect(kernel.getVatIds()).toStrictEqual([]);
    });
  });

  describe('restartVat()', () => {
    it('preserves vat state across multiple restarts', async () => {
      const kernel = await Kernel.make(
        mockStream,
        mockWorkerService,
        mockKernelDatabase,
      );
      await kernel.launchVat(makeMockVatConfig());
      await kernel.restartVat('v1');
      expect(kernel.getVatIds()).toStrictEqual(['v1']);
      await kernel.restartVat('v1');
      expect(kernel.getVatIds()).toStrictEqual(['v1']);
      expect(vatHandles).toHaveLength(3); // Three instances created
      expect(vatHandles[0]?.terminate).toHaveBeenCalledTimes(1);
      expect(vatHandles[1]?.terminate).toHaveBeenCalledTimes(1);
      expect(vatHandles[2]?.terminate).not.toHaveBeenCalled();
      expect(launchWorkerMock).toHaveBeenCalledTimes(3); // initial + 2 restarts
      expect(launchWorkerMock).toHaveBeenLastCalledWith(
        'v1',
        makeMockVatConfig(),
      );
    });

    it('restarts a vat', async () => {
      const kernel = await Kernel.make(
        mockStream,
        mockWorkerService,
        mockKernelDatabase,
      );
      await kernel.launchVat(makeMockVatConfig());
      expect(kernel.getVatIds()).toStrictEqual(['v1']);
      await kernel.restartVat('v1');
      expect(vatHandles[0]?.terminate).toHaveBeenCalledOnce();
      expect(terminateWorkerMock).toHaveBeenCalledOnce();
      expect(launchWorkerMock).toHaveBeenCalledTimes(2);
      expect(launchWorkerMock).toHaveBeenLastCalledWith(
        'v1',
        makeMockVatConfig(),
      );
      expect(kernel.getVatIds()).toStrictEqual(['v1']);
      expect(makeVatHandleMock).toHaveBeenCalledTimes(2);
    });

    it('throws error when restarting non-existent vat', async () => {
      const kernel = await Kernel.make(
        mockStream,
        mockWorkerService,
        mockKernelDatabase,
      );
      await expect(kernel.restartVat('v999')).rejects.toThrow(VatNotFoundError);
      expect(vatHandles).toHaveLength(0);
      expect(launchWorkerMock).not.toHaveBeenCalled();
    });

    it('handles restart failure during termination', async () => {
      const kernel = await Kernel.make(
        mockStream,
        mockWorkerService,
        mockKernelDatabase,
      );
      await kernel.launchVat(makeMockVatConfig());
      vatHandles[0]?.terminate.mockRejectedValueOnce(
        new Error('Termination failed'),
      );
      await expect(kernel.restartVat('v1')).rejects.toThrow(
        'Termination failed',
      );
      expect(launchWorkerMock).toHaveBeenCalledTimes(1);
    });

    it('handles restart failure during launch', async () => {
      const kernel = await Kernel.make(
        mockStream,
        mockWorkerService,
        mockKernelDatabase,
      );
      await kernel.launchVat(makeMockVatConfig());
      launchWorkerMock.mockRejectedValueOnce(new Error('Launch failed'));
      await expect(kernel.restartVat('v1')).rejects.toThrow('Launch failed');
      expect(vatHandles[0]?.terminate).toHaveBeenCalledOnce();
      expect(kernel.getVatIds()).toStrictEqual([]);
    });

    it('returns the original vat handle', async () => {
      const kernel = await Kernel.make(
        mockStream,
        mockWorkerService,
        mockKernelDatabase,
      );
      await kernel.launchVat(makeMockVatConfig());
      const originalHandle = vatHandles[0];
      const returnedHandle = await kernel.restartVat('v1');
      expect(returnedHandle).toBe(originalHandle);
    });
  });

  describe('pingVat()', () => {
    it('pings a vat without errors when the vat exists', async () => {
      const kernel = await Kernel.make(
        mockStream,
        mockWorkerService,
        mockKernelDatabase,
      );
      await kernel.launchVat(makeMockVatConfig());
      vatHandles[0]?.ping.mockResolvedValueOnce('pong');
      const result = await kernel.pingVat('v1');
      expect(vatHandles[0]?.ping).toHaveBeenCalledTimes(1);
      expect(result).toBe('pong');
    });

    it('throws an error when pinging a vat that does not exist in the kernel', async () => {
      const kernel = await Kernel.make(
        mockStream,
        mockWorkerService,
        mockKernelDatabase,
      );
      const nonExistentVatId: VatId = 'v9';
      await expect(async () =>
        kernel.pingVat(nonExistentVatId),
      ).rejects.toThrow(VatNotFoundError);
    });

    it('propagates errors from the vat ping method', async () => {
      const kernel = await Kernel.make(
        mockStream,
        mockWorkerService,
        mockKernelDatabase,
      );
      await kernel.launchVat(makeMockVatConfig());
      const pingError = new Error('Ping failed');
      vatHandles[0]?.ping.mockRejectedValueOnce(pingError);
      await expect(async () => kernel.pingVat('v1')).rejects.toThrow(pingError);
    });
  });

  describe('reset()', () => {
    it('terminates all vats and resets kernel state', async () => {
      const mockDb = makeMapKernelDatabase();
      const clearSpy = vi.spyOn(mockDb, 'clear');
      const kernel = await Kernel.make(mockStream, mockWorkerService, mockDb);
      await kernel.launchVat(makeMockVatConfig());
      await kernel.reset();
      expect(clearSpy).toHaveBeenCalled();
      expect(kernel.getVatIds()).toHaveLength(0);
    });
  });

  describe('pinVatRoot and unpinVatRoot', () => {
    it('pins and unpins a vat root correctly', async () => {
      const kernel = await Kernel.make(
        mockStream,
        mockWorkerService,
        mockKernelDatabase,
      );
      const config = makeMockVatConfig();
      const rootRef = await kernel.launchVat(config);
      // Pinning existing vat root should return the kref
      expect(kernel.pinVatRoot('v1')).toBe(rootRef);
      // Pinning non-existent vat should throw
      expect(() => kernel.pinVatRoot('v2')).toThrow(VatNotFoundError);
      // Unpinning existing vat root should succeed
      expect(() => kernel.unpinVatRoot('v1')).not.toThrow();
      // Unpinning non-existent vat should throw
      expect(() => kernel.unpinVatRoot('v3')).toThrow(VatNotFoundError);
    });
  });
});
