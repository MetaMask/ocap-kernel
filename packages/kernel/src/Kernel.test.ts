import { VatNotFoundError } from '@ocap/errors';
import type { KernelDatabase } from '@ocap/store';
import type { DuplexStream } from '@ocap/streams';
import type { Mocked, MockInstance } from 'vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { Kernel } from './Kernel.ts';
import type {
  KernelCommand,
  KernelCommandReply,
  VatCommand,
  VatCommandReply,
} from './messages/index.ts';
import type {
  VatId,
  VatConfig,
  VatWorkerService,
  ClusterConfig,
} from './types.ts';
import { VatHandle } from './VatHandle.ts';
import { makeMapKernelDatabase } from '../test/storage.ts';

describe('Kernel', () => {
  let mockStream: DuplexStream<KernelCommand, KernelCommandReply>;
  let mockWorkerService: VatWorkerService;
  let launchWorkerMock: MockInstance;
  let terminateWorkerMock: MockInstance;
  let makeVatHandleMock: MockInstance;
  let vatHandles: Mocked<VatHandle>[];
  let mockKernelDatabase: KernelDatabase;

  const makeMockVatConfig = (): VatConfig => ({
    sourceSpec: 'not-really-there.js',
  });
  const makeMockClusterConfig = (): ClusterConfig => ({
    bootstrap: 'alice',
    forceReset: null,
    bundles: null,
    vats: {
      alice: {
        bundleSpec: 'http://localhost:3000/sample-vat.bundle',
        parameters: {
          name: 'Alice',
        },
      },
    },
  });

  beforeEach(() => {
    mockStream = {
      write: vi.fn(),
      next: vi.fn(),
      return: vi.fn(),
      drain: vi.fn(),
      throw: vi.fn(),
      [Symbol.asyncIterator]: vi.fn(() => mockStream),
    } as unknown as DuplexStream<KernelCommand, KernelCommandReply>;

    mockWorkerService = {
      launch: async () => ({}),
      terminate: async () => undefined,
      terminateAll: async () => undefined,
    } as unknown as VatWorkerService;

    launchWorkerMock = vi
      .spyOn(mockWorkerService, 'launch')
      .mockResolvedValue(
        {} as unknown as DuplexStream<VatCommandReply, VatCommand>,
      );
    terminateWorkerMock = vi
      .spyOn(mockWorkerService, 'terminate')
      .mockResolvedValue(undefined);

    vatHandles = [];
    makeVatHandleMock = vi
      .spyOn(VatHandle, 'make')
      .mockImplementation(async () => {
        const vatHandle = {
          init: vi.fn(),
          terminate: vi.fn(),
          handleMessage: vi.fn(),
          deliverMessage: vi.fn(),
          deliverNotify: vi.fn(),
          sendVatCommand: vi.fn(),
          config: makeMockVatConfig(),
        } as unknown as VatHandle;
        vatHandles.push(vatHandle as Mocked<VatHandle>);
        return vatHandle;
      });

    mockKernelDatabase = makeMapKernelDatabase();
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
  });

  describe('sendVatCommand()', () => {
    it('sends a message to the vat without errors when the vat exists', async () => {
      const kernel = await Kernel.make(
        mockStream,
        mockWorkerService,
        mockKernelDatabase,
      );
      await kernel.launchVat(makeMockVatConfig());
      vatHandles[0]?.sendVatCommand.mockResolvedValueOnce('test');
      expect(
        await kernel.sendVatCommand(
          'v1',
          'test' as unknown as VatCommand['payload'],
        ),
      ).toBe('test');
    });

    it('throws an error when sending a message to the vat that does not exist in the kernel', async () => {
      const kernel = await Kernel.make(
        mockStream,
        mockWorkerService,
        mockKernelDatabase,
      );
      const nonExistentVatId: VatId = 'v9';
      await expect(async () =>
        kernel.sendVatCommand(nonExistentVatId, {} as VatCommand['payload']),
      ).rejects.toThrow(VatNotFoundError);
    });

    it('throws an error when sending a message to the vat throws', async () => {
      const kernel = await Kernel.make(
        mockStream,
        mockWorkerService,
        mockKernelDatabase,
      );
      await kernel.launchVat(makeMockVatConfig());
      vatHandles[0]?.sendVatCommand.mockRejectedValueOnce('error');
      await expect(async () =>
        kernel.sendVatCommand('v1', {} as VatCommand['payload']),
      ).rejects.toThrow('error');
    });
  });

  describe('constructor()', () => {
    it('initializes the kernel without errors', () => {
      expect(
        async () =>
          await Kernel.make(mockStream, mockWorkerService, mockKernelDatabase),
      ).not.toThrow();
    });
  });

  describe('init()', () => {
    it.todo('initializes the kernel store');

    it.todo('starts receiving messages');

    it.todo('throws if the stream throws');
  });

  describe('reload()', () => {
    it('should reload with current config when config exists', async () => {
      const kernel = await Kernel.make(
        mockStream,
        mockWorkerService,
        mockKernelDatabase,
      );
      kernel.clusterConfig = makeMockClusterConfig();
      await kernel.launchVat(makeMockVatConfig());
      const launchSubclusterMock = vi
        .spyOn(kernel, 'launchSubcluster')
        .mockResolvedValueOnce(undefined);
      await kernel.reload();
      expect(vatHandles[0]?.terminate).toHaveBeenCalledTimes(1);
      expect(launchSubclusterMock).toHaveBeenCalledOnce();
    });

    it('should throw if no config exists', async () => {
      const kernel = await Kernel.make(
        mockStream,
        mockWorkerService,
        mockKernelDatabase,
      );
      await expect(kernel.reload()).rejects.toThrow('no subcluster to reload');
    });

    it('should propagate errors from terminateAllVats', async () => {
      const kernel = await Kernel.make(
        mockStream,
        mockWorkerService,
        mockKernelDatabase,
      );
      kernel.clusterConfig = makeMockClusterConfig();
      const error = new Error('Termination failed');
      vi.spyOn(kernel, 'terminateAllVats').mockRejectedValueOnce(error);
      await expect(kernel.reload()).rejects.toThrow(error);
    });
  });
});
