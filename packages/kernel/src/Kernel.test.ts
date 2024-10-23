import '@ocap/shims/endoify';

import { VatAlreadyExistsError, VatNotFoundError } from '@ocap/errors';
import type { MessagePortDuplexStream, DuplexStream } from '@ocap/streams';
import type { MockInstance } from 'vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { KernelStore } from './kernel-store.js';
import { Kernel } from './Kernel.js';
import type {
  KernelCommand,
  KernelCommandReply,
  VatCommand,
} from './messages/index.js';
import type { StreamEnvelope, StreamEnvelopeReply } from './stream-envelope.js';
import type { VatId, VatWorkerService } from './types.js';
import { Vat } from './Vat.js';
import { makeMapKernelStore } from '../test/storage.js';

describe('Kernel', () => {
  let mockStream: DuplexStream<KernelCommand, KernelCommandReply>;
  let mockWorkerService: VatWorkerService;
  let mockGetWorkerStreams: MockInstance;
  let mockDeleteWorker: MockInstance;
  let initMock: MockInstance;
  let terminateMock: MockInstance;

  let mockKernelStore: KernelStore;

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
      initWorker: async () => ({}),
      deleteWorker: async () => undefined,
    } as unknown as VatWorkerService;

    mockGetWorkerStreams = vi
      .spyOn(mockWorkerService, 'initWorker')
      .mockResolvedValue(
        {} as DuplexStream<StreamEnvelopeReply, StreamEnvelope>,
      );
    mockDeleteWorker = vi
      .spyOn(mockWorkerService, 'deleteWorker')
      .mockResolvedValue(undefined);

    initMock = vi.spyOn(Vat.prototype, 'init').mockImplementation(vi.fn());
    terminateMock = vi
      .spyOn(Vat.prototype, 'terminate')
      .mockImplementation(vi.fn());

    mockKernelStore = makeMapKernelStore();
  });

  describe('getVatIds()', () => {
    it('returns an empty array when no vats are added', () => {
      const kernel = new Kernel(mockStream, mockWorkerService, mockKernelStore);
      expect(kernel.getVatIds()).toStrictEqual([]);
    });

    it('returns the vat IDs after adding a vat', async () => {
      const kernel = new Kernel(mockStream, mockWorkerService, mockKernelStore);
      await kernel.launchVat({ id: 'v0' });
      expect(kernel.getVatIds()).toStrictEqual(['v0']);
    });

    it('returns multiple vat IDs after adding multiple vats', async () => {
      const kernel = new Kernel(mockStream, mockWorkerService, mockKernelStore);
      await kernel.launchVat({ id: 'v0' });
      await kernel.launchVat({ id: 'v1' });
      expect(kernel.getVatIds()).toStrictEqual(['v0', 'v1']);
    });
  });

  describe('launchVat()', () => {
    it('adds a vat to the kernel without errors when no vat with the same ID exists', async () => {
      const kernel = new Kernel(mockStream, mockWorkerService, mockKernelStore);
      await kernel.launchVat({ id: 'v0' });
      expect(initMock).toHaveBeenCalledOnce();
      expect(mockGetWorkerStreams).toHaveBeenCalled();
      expect(kernel.getVatIds()).toStrictEqual(['v0']);
    });

    it('throws an error when launching a vat that already exists in the kernel', async () => {
      const kernel = new Kernel(mockStream, mockWorkerService, mockKernelStore);
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

  describe('deleteVat()', () => {
    it('deletes a vat from the kernel without errors when the vat exists', async () => {
      const kernel = new Kernel(mockStream, mockWorkerService, mockKernelStore);
      await kernel.launchVat({ id: 'v0' });
      expect(kernel.getVatIds()).toStrictEqual(['v0']);
      await kernel.deleteVat('v0');
      expect(terminateMock).toHaveBeenCalledOnce();
      expect(mockDeleteWorker).toHaveBeenCalledOnce();
      expect(kernel.getVatIds()).toStrictEqual([]);
    });

    it('throws an error when deleting a vat that does not exist in the kernel', async () => {
      const kernel = new Kernel(mockStream, mockWorkerService, mockKernelStore);
      const nonExistentVatId: VatId = 'v9';
      await expect(async () =>
        kernel.deleteVat(nonExistentVatId),
      ).rejects.toThrow(VatNotFoundError);
      expect(terminateMock).not.toHaveBeenCalled();
    });

    it('throws an error when a vat terminate method throws', async () => {
      const kernel = new Kernel(mockStream, mockWorkerService, mockKernelStore);
      await kernel.launchVat({ id: 'v0' });
      vi.spyOn(Vat.prototype, 'terminate').mockRejectedValueOnce('Test error');
      await expect(async () => kernel.deleteVat('v0')).rejects.toThrow(
        'Test error',
      );
    });
  });

  describe('sendMessage()', () => {
    it('sends a message to the vat without errors when the vat exists', async () => {
      const kernel = new Kernel(mockStream, mockWorkerService, mockKernelStore);
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
      const kernel = new Kernel(mockStream, mockWorkerService, mockKernelStore);
      const nonExistentVatId: VatId = 'v9';
      await expect(async () =>
        kernel.sendMessage(nonExistentVatId, {} as VatCommand['payload']),
      ).rejects.toThrow(VatNotFoundError);
    });

    it('throws an error when sending a message to the vat throws', async () => {
      const kernel = new Kernel(mockStream, mockWorkerService, mockKernelStore);
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
        async () => new Kernel(mockStream, mockWorkerService, mockKernelStore),
      ).not.toThrow();
    });
  });

  describe('init()', () => {
    it.todo('initializes the kernel store');

    it.todo('starts receiving messages');
  });
});
