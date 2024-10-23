import '@ocap/shims/endoify';

import { VatAlreadyExistsError, VatNotFoundError } from '@ocap/errors';
import type { MessagePortDuplexStream, DuplexStream } from '@ocap/streams';
import type { MockInstance } from 'vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { KVStore } from './kernel-store.js';
import { Kernel } from './Kernel.js';
import type {
  KernelCommand,
  KernelCommandReply,
  VatCommand,
} from './messages/index.js';
import type { StreamEnvelope, StreamEnvelopeReply } from './stream-envelope.js';
import type { VatId, VatWorkerService } from './types.js';
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
    } as unknown as VatWorkerService;

    launchWorkerMock = vi
      .spyOn(mockWorkerService, 'launch')
      .mockResolvedValue(
        {} as DuplexStream<StreamEnvelopeReply, StreamEnvelope>,
      );
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
      await kernel.launchVat({ id: 'v0' });
      expect(kernel.getVatIds()).toStrictEqual(['v0']);
    });

    it('returns multiple vat IDs after adding multiple vats', async () => {
      const kernel = new Kernel(mockStream, mockWorkerService, mockKVStore);
      await kernel.launchVat({ id: 'v0' });
      await kernel.launchVat({ id: 'v1' });
      expect(kernel.getVatIds()).toStrictEqual(['v0', 'v1']);
    });
  });

  describe('launchVat()', () => {
    it('adds a vat to the kernel without errors when no vat with the same ID exists', async () => {
      const kernel = new Kernel(mockStream, mockWorkerService, mockKVStore);
      await kernel.launchVat({ id: 'v0' });
      expect(initMock).toHaveBeenCalledOnce();
      expect(launchWorkerMock).toHaveBeenCalled();
      expect(kernel.getVatIds()).toStrictEqual(['v0']);
    });

    it('adds multiple vats to the kernel without errors when no vat with the same ID exists', async () => {
      const kernel = new Kernel(mockStream, mockWorkerService, mockKernelStore);
      await kernel.launchVat({ id: 'v0' });
      await kernel.launchVat({ id: 'v1' });
      expect(initMock).toHaveBeenCalledTimes(2);
      expect(mockGetWorkerStreams).toHaveBeenCalledTimes(2);
      expect(kernel.getVatIds()).toStrictEqual(['v0', 'v1']);
    });

    it('throws an error when launching a vat that already exists in the kernel', async () => {
      const kernel = new Kernel(mockStream, mockWorkerService, mockKVStore);
      await kernel.launchVat({ id: 'v0' });
      expect(kernel.getVatIds()).toStrictEqual(['v0']);
      await expect(
        kernel.launchVat({
          id: 'v0',
        }),
      ).rejects.toThrow(VatAlreadyExistsError);
      expect(kernel.getVatIds()).toStrictEqual(['v0']);
    });
  });

  describe('terminateVat()', () => {
    it('deletes a vat from the kernel without errors when the vat exists', async () => {
      const kernel = new Kernel(mockStream, mockWorkerService, mockKVStore);
      await kernel.launchVat({ id: 'v0' });
      expect(kernel.getVatIds()).toStrictEqual(['v0']);
      await kernel.terminateVat('v0');
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
      await kernel.launchVat({ id: 'v0' });
      vi.spyOn(Vat.prototype, 'terminate').mockRejectedValueOnce('Test error');
      await expect(async () => kernel.terminateVat('v0')).rejects.toThrow(
        'Test error',
      );
    });
  });

  describe('restartVat()', () => {
    it('restarts a vat', async () => {
      const kernel = new Kernel(mockStream, mockWorkerService, mockKernelStore);
      await kernel.launchVat({ id: 'v0' });
      expect(kernel.getVatIds()).toStrictEqual(['v0']);
      await kernel.restartVat('v0');
      expect(terminateMock).toHaveBeenCalledOnce();
      expect(mockDeleteWorker).toHaveBeenCalledOnce();
      expect(kernel.getVatIds()).toStrictEqual(['v0']);
      expect(initMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('sendMessage()', () => {
    it('sends a message to the vat without errors when the vat exists', async () => {
      const kernel = new Kernel(mockStream, mockWorkerService, mockKVStore);
      await kernel.launchVat({ id: 'v0' });
      vi.spyOn(Vat.prototype, 'sendMessage').mockResolvedValueOnce('test');
      expect(
        await kernel.sendMessage(
          'v0',
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
      await kernel.launchVat({ id: 'v0' });
      vi.spyOn(Vat.prototype, 'sendMessage').mockRejectedValueOnce('error');
      await expect(async () =>
        kernel.sendMessage('v0', {} as VatCommand['payload']),
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

    it.todo('throws an error if the stream is invalid');
  });
});
