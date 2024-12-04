import { VatNotFoundError } from '@ocap/errors';
import type {
  MessagePortDuplexStream,
  DuplexStream,
  StreamMultiplexer,
} from '@ocap/streams';
import type { MockInstance } from 'vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { KVStore } from './kernel-store.js';
import { Kernel } from './Kernel.js';
import type {
  KernelCommand,
  KernelCommandReply,
  VatCommand,
} from './messages/index.js';
import type { VatId, VatConfig, VatWorkerService } from './types.js';
import { Vat } from './Vat.js';
import { makeMapKVStore } from '../test/storage.js';

describe('Kernel', () => {
  let mockStream: DuplexStream<KernelCommand, KernelCommandReply>;
  let mockWorkerService: VatWorkerService;
  let launchWorkerMock: MockInstance;
  let terminateWorkerMock: MockInstance;
  let initMock: MockInstance;
  let terminateMock: MockInstance;

  let mockKVStore: KVStore;

  const mockVatConfig: VatConfig = { sourceSpec: 'not-really-there.js' };

  beforeEach(() => {
    mockStream = {
      write: vi.fn(),
      next: vi.fn(),
      return: vi.fn(),
      drain: vi.fn(),
      throw: vi.fn(),
      [Symbol.asyncIterator]: vi.fn(() => mockStream),
    } as unknown as MessagePortDuplexStream<KernelCommand, KernelCommandReply>;

    mockWorkerService = {
      launch: async () => ({}),
      terminate: async () => undefined,
      terminateAll: async () => undefined,
    } as unknown as VatWorkerService;

    launchWorkerMock = vi.spyOn(mockWorkerService, 'launch').mockResolvedValue({
      start: async () => Promise.resolve(),
      createChannel: () => mockStream,
    } as unknown as StreamMultiplexer);
    terminateWorkerMock = vi
      .spyOn(mockWorkerService, 'terminate')
      .mockResolvedValue(undefined);

    initMock = vi.spyOn(Vat.prototype, 'init').mockImplementation(vi.fn());
    terminateMock = vi
      .spyOn(Vat.prototype, 'terminate')
      .mockImplementation(vi.fn());

    mockKVStore = makeMapKVStore();
  });

  describe('getVatIds()', () => {
    it('returns an empty array when no vats are added', () => {
      const kernel = new Kernel(mockStream, mockWorkerService, mockKVStore);
      expect(kernel.getVatIds()).toStrictEqual([]);
    });

    it('returns the vat IDs after adding a vat', async () => {
      const kernel = new Kernel(mockStream, mockWorkerService, mockKVStore);
      await kernel.launchVat(mockVatConfig);
      expect(kernel.getVatIds()).toStrictEqual(['v1']);
    });

    it('returns multiple vat IDs after adding multiple vats', async () => {
      const kernel = new Kernel(mockStream, mockWorkerService, mockKVStore);
      await kernel.launchVat(mockVatConfig);
      await kernel.launchVat(mockVatConfig);
      expect(kernel.getVatIds()).toStrictEqual(['v1', 'v2']);
    });
  });

  describe('launchVat()', () => {
    it('adds a vat to the kernel without errors when no vat with the same ID exists', async () => {
      const kernel = new Kernel(mockStream, mockWorkerService, mockKVStore);
      await kernel.launchVat(mockVatConfig);
      expect(initMock).toHaveBeenCalledOnce();
      expect(launchWorkerMock).toHaveBeenCalled();
      expect(kernel.getVatIds()).toStrictEqual(['v1']);
    });

    it('adds multiple vats to the kernel without errors when no vat with the same ID exists', async () => {
      const kernel = new Kernel(mockStream, mockWorkerService, mockKVStore);
      await kernel.launchVat(mockVatConfig);
      await kernel.launchVat(mockVatConfig);
      expect(initMock).toHaveBeenCalledTimes(2);
      expect(launchWorkerMock).toHaveBeenCalledTimes(2);
      expect(kernel.getVatIds()).toStrictEqual(['v1', 'v2']);
    });
  });

  describe('terminateVat()', () => {
    it('deletes a vat from the kernel without errors when the vat exists', async () => {
      const kernel = new Kernel(mockStream, mockWorkerService, mockKVStore);
      await kernel.launchVat(mockVatConfig);
      expect(kernel.getVatIds()).toStrictEqual(['v1']);
      await kernel.terminateVat('v1');
      expect(terminateMock).toHaveBeenCalledOnce();
      expect(terminateWorkerMock).toHaveBeenCalledOnce();
      expect(kernel.getVatIds()).toStrictEqual([]);
    });

    it('throws an error when deleting a vat that does not exist in the kernel', async () => {
      const kernel = new Kernel(mockStream, mockWorkerService, mockKVStore);
      const nonExistentVatId: VatId = 'v9';
      await expect(async () =>
        kernel.terminateVat(nonExistentVatId),
      ).rejects.toThrow(VatNotFoundError);
      expect(terminateMock).not.toHaveBeenCalled();
    });

    it('throws an error when a vat terminate method throws', async () => {
      const kernel = new Kernel(mockStream, mockWorkerService, mockKVStore);
      await kernel.launchVat(mockVatConfig);
      vi.spyOn(Vat.prototype, 'terminate').mockRejectedValueOnce('Test error');
      await expect(async () => kernel.terminateVat('v1')).rejects.toThrow(
        'Test error',
      );
    });
  });

  describe('terminateAllVats()', () => {
    it('deletes all vats from the kernel without errors', async () => {
      const workerTerminateAllMock = vi
        .spyOn(mockWorkerService, 'terminateAll')
        .mockResolvedValue(undefined);
      const kernel = new Kernel(mockStream, mockWorkerService, mockKVStore);
      await kernel.launchVat(mockVatConfig);
      await kernel.launchVat(mockVatConfig);
      expect(kernel.getVatIds()).toStrictEqual(['v1', 'v2']);
      await kernel.terminateAllVats();
      expect(terminateMock).toHaveBeenCalledTimes(2);
      expect(workerTerminateAllMock).toHaveBeenCalledOnce();
      expect(kernel.getVatIds()).toStrictEqual([]);
    });
  });

  describe('restartVat()', () => {
    it('preserves vat state across multiple restarts', async () => {
      const kernel = new Kernel(mockStream, mockWorkerService, mockKVStore);
      await kernel.launchVat(mockVatConfig);
      await kernel.restartVat('v1');
      expect(kernel.getVatIds()).toStrictEqual(['v1']);
      await kernel.restartVat('v1');
      expect(kernel.getVatIds()).toStrictEqual(['v1']);
      expect(terminateMock).toHaveBeenCalledTimes(2);
      expect(launchWorkerMock).toHaveBeenCalledTimes(3); // initial + 2 restarts
      expect(launchWorkerMock).toHaveBeenLastCalledWith('v1', mockVatConfig);
    });

    it('restarts a vat', async () => {
      const kernel = new Kernel(mockStream, mockWorkerService, mockKVStore);
      await kernel.launchVat(mockVatConfig);
      expect(kernel.getVatIds()).toStrictEqual(['v1']);
      await kernel.restartVat('v1');
      expect(terminateMock).toHaveBeenCalledOnce();
      expect(terminateWorkerMock).toHaveBeenCalledOnce();
      expect(launchWorkerMock).toHaveBeenCalledTimes(2);
      expect(launchWorkerMock).toHaveBeenLastCalledWith('v1', mockVatConfig);
      expect(kernel.getVatIds()).toStrictEqual(['v1']);
      expect(initMock).toHaveBeenCalledTimes(2);
    });

    it('throws error when restarting non-existent vat', async () => {
      const kernel = new Kernel(mockStream, mockWorkerService, mockKVStore);
      await expect(kernel.restartVat('v999')).rejects.toThrow(VatNotFoundError);
      expect(terminateMock).not.toHaveBeenCalled();
      expect(launchWorkerMock).not.toHaveBeenCalled();
    });

    it('handles restart failure during termination', async () => {
      const kernel = new Kernel(mockStream, mockWorkerService, mockKVStore);
      await kernel.launchVat(mockVatConfig);
      terminateMock.mockRejectedValueOnce(new Error('Termination failed'));
      await expect(kernel.restartVat('v1')).rejects.toThrow(
        'Termination failed',
      );
      expect(launchWorkerMock).toHaveBeenCalledTimes(1);
    });

    it('handles restart failure during launch', async () => {
      const kernel = new Kernel(mockStream, mockWorkerService, mockKVStore);
      await kernel.launchVat(mockVatConfig);
      launchWorkerMock.mockRejectedValueOnce(new Error('Launch failed'));
      await expect(kernel.restartVat('v1')).rejects.toThrow('Launch failed');
      expect(terminateMock).toHaveBeenCalledOnce();
      expect(kernel.getVatIds()).toStrictEqual([]);
    });
  });

  describe('sendMessage()', () => {
    it('sends a message to the vat without errors when the vat exists', async () => {
      const kernel = new Kernel(mockStream, mockWorkerService, mockKVStore);
      await kernel.launchVat(mockVatConfig);
      vi.spyOn(Vat.prototype, 'sendMessage').mockResolvedValueOnce('test');
      expect(
        await kernel.sendMessage(
          'v1',
          'test' as unknown as VatCommand['payload'],
        ),
      ).toBe('test');
    });

    it('throws an error when sending a message to the vat that does not exist in the kernel', async () => {
      const kernel = new Kernel(mockStream, mockWorkerService, mockKVStore);
      const nonExistentVatId: VatId = 'v9';
      await expect(async () =>
        kernel.sendMessage(nonExistentVatId, {} as VatCommand['payload']),
      ).rejects.toThrow(VatNotFoundError);
    });

    it('throws an error when sending a message to the vat throws', async () => {
      const kernel = new Kernel(mockStream, mockWorkerService, mockKVStore);
      await kernel.launchVat(mockVatConfig);
      vi.spyOn(Vat.prototype, 'sendMessage').mockRejectedValueOnce('error');
      await expect(async () =>
        kernel.sendMessage('v1', {} as VatCommand['payload']),
      ).rejects.toThrow('error');
    });
  });

  describe('constructor()', () => {
    it('initializes the kernel without errors', () => {
      expect(
        async () => new Kernel(mockStream, mockWorkerService, mockKVStore),
      ).not.toThrow();
    });
  });

  describe('init()', () => {
    it.todo('initializes the kernel store');

    it.todo('starts receiving messages');

    it.todo('throws if the stream throws');
  });
});
