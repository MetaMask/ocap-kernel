import type { VatOneResolution } from '@agoric/swingset-liveslots';
import type { CapData } from '@endo/marshal';
import { makePromiseKit } from '@endo/promise-kit';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MockInstance } from 'vitest';

import { KernelQueue } from './KernelQueue.ts';
import type { KernelStore } from './store/index.ts';
import type {
  KRef,
  Message,
  RunQueueItem,
  RunQueueItemNotify,
} from './types.ts';

vi.mock('./services/garbage-collection.ts', () => ({
  processGCActionSet: vi.fn().mockReturnValue(null),
}));

vi.mock('@endo/promise-kit', () => ({
  makePromiseKit: vi.fn(),
}));

describe('KernelQueue', () => {
  let kernelStore: KernelStore;
  let kernelQueue: KernelQueue;
  let mockPromiseKit: ReturnType<typeof makePromiseKit>;

  beforeEach(() => {
    mockPromiseKit = {
      promise: Promise.resolve(),
      resolve: vi.fn(),
      reject: vi.fn(),
    };
    (makePromiseKit as unknown as MockInstance).mockReturnValue(mockPromiseKit);
    kernelStore = {
      nextTerminatedVatCleanup: vi.fn(),
      collectGarbage: vi.fn(),
      runQueueLength: vi.fn(),
      dequeueRun: vi.fn(),
      enqueueRun: vi.fn(),
      initKernelPromise: vi.fn().mockReturnValue(['kp1']),
      incrementRefCount: vi.fn(),
      getKernelPromise: vi.fn(),
      resolveKernelPromise: vi.fn(),
      nextReapAction: vi.fn().mockReturnValue(null),
      getGCActions: vi.fn().mockReturnValue([]),
    } as unknown as KernelStore;

    kernelQueue = new KernelQueue(kernelStore);
  });

  describe('run', () => {
    it('processes items from the run queue and performs cleanup', async () => {
      const mockItem: RunQueueItem = {
        type: 'send',
        target: 'ko123',
        message: {} as Message,
      };
      (
        kernelStore.runQueueLength as unknown as MockInstance
      ).mockReturnValueOnce(1);
      (kernelStore.dequeueRun as unknown as MockInstance).mockReturnValue(
        mockItem,
      );
      const deliverError = new Error('stop');
      const deliver = vi.fn().mockRejectedValue(deliverError);
      await expect(kernelQueue.run(deliver)).rejects.toBe(deliverError);
      expect(kernelStore.nextTerminatedVatCleanup).toHaveBeenCalled();
      expect(deliver).toHaveBeenCalledWith(mockItem);
    });
  });

  describe('enqueueMessage', () => {
    it('creates a message, enqueues it, and returns a promise for the result', async () => {
      const target = 'ko123';
      const method = 'test';
      const args = ['arg1', { key: 'value' }];
      const resultValue = { body: 'result', slots: [] };
      let resolvePromise = (_value: CapData<KRef>): void => {
        // do nothing
      };
      const resultPromiseRaw = new Promise<CapData<KRef>>((resolve) => {
        resolvePromise = resolve;
      });
      const successPromiseKit = {
        promise: resultPromiseRaw,
        resolve: resolvePromise,
      };
      (makePromiseKit as unknown as MockInstance).mockReturnValueOnce(
        successPromiseKit,
      );
      const resultPromise = kernelQueue.enqueueMessage(target, method, args);
      expect(kernelStore.initKernelPromise).toHaveBeenCalled();
      expect(kernelStore.incrementRefCount).toHaveBeenCalledWith(
        target,
        'queue|target',
      );
      expect(kernelStore.incrementRefCount).toHaveBeenCalledWith(
        'kp1',
        'queue|result',
      );
      expect(kernelStore.enqueueRun).toHaveBeenCalledWith({
        type: 'send',
        target,
        message: expect.objectContaining({
          methargs: expect.anything(),
          result: 'kp1',
        }),
      });
      expect(kernelQueue.subscriptions.has('kp1')).toBe(true);
      const handler = kernelQueue.subscriptions.get('kp1');
      expect(handler).toBeDefined();
      resolvePromise(resultValue);
      const result = await resultPromise;
      expect(result).toStrictEqual(resultValue);
    });
  });

  describe('enqueueSend', () => {
    it('enqueues a send message and increments reference counts', () => {
      const target = 'ko123';
      const message: Message = {
        methargs: { body: 'method args', slots: ['slot1', 'slot2'] },
        result: 'kp456',
      };
      kernelQueue.enqueueSend(target, message);
      expect(kernelStore.incrementRefCount).toHaveBeenCalledWith(
        target,
        'queue|target',
      );
      expect(kernelStore.incrementRefCount).toHaveBeenCalledWith(
        message.result,
        'queue|result',
      );
      expect(kernelStore.incrementRefCount).toHaveBeenCalledWith(
        'slot1',
        'queue|slot',
      );
      expect(kernelStore.incrementRefCount).toHaveBeenCalledWith(
        'slot2',
        'queue|slot',
      );
      expect(kernelStore.enqueueRun).toHaveBeenCalledWith({
        type: 'send',
        target,
        message,
      });
    });

    it('handles messages without result or slots', () => {
      const target = 'ko123';
      const message: Message = {
        methargs: { body: 'method args', slots: [] },
        result: null,
      };
      kernelQueue.enqueueSend(target, message);
      expect(kernelStore.incrementRefCount).toHaveBeenCalledTimes(1);
      expect(kernelStore.incrementRefCount).toHaveBeenCalledWith(
        target,
        'queue|target',
      );
      expect(kernelStore.enqueueRun).toHaveBeenCalledWith({
        type: 'send',
        target,
        message,
      });
    });
  });

  describe('enqueueNotify', () => {
    it('creates a notify item and adds it to the run queue', () => {
      const vatId = 'v1';
      const kpid = 'kp123';
      kernelQueue.enqueueNotify(vatId, kpid);
      const expectedNotifyItem: RunQueueItemNotify = {
        type: 'notify',
        vatId,
        kpid,
      };
      expect(kernelStore.enqueueRun).toHaveBeenCalledWith(expectedNotifyItem);
      expect(kernelStore.incrementRefCount).toHaveBeenCalledWith(
        kpid,
        'notify',
      );
    });
  });

  describe('resolvePromises', () => {
    it('resolves kernel promises and notifies subscribers', () => {
      const vatId = 'v1';
      const kpid = 'kp123';
      const resolution: VatOneResolution = [
        kpid,
        false,
        { body: 'resolved value', slots: ['slot1'] } as CapData<KRef>,
      ];
      (kernelStore.getKernelPromise as unknown as MockInstance).mockReturnValue(
        {
          state: 'unresolved',
          decider: vatId,
          subscribers: ['v2', 'v3'],
        },
      );
      const resolveHandler = vi.fn();
      kernelQueue.subscriptions.set(kpid, resolveHandler);
      kernelQueue.resolvePromises(vatId, [resolution]);
      expect(kernelStore.incrementRefCount).toHaveBeenCalledWith(
        kpid,
        'resolve|kpid',
      );
      expect(kernelStore.incrementRefCount).toHaveBeenCalledWith(
        'slot1',
        'resolve|slot',
      );
      expect(kernelStore.enqueueRun).toHaveBeenCalledWith({
        type: 'notify',
        vatId: 'v2',
        kpid,
      });
      expect(kernelStore.enqueueRun).toHaveBeenCalledWith({
        type: 'notify',
        vatId: 'v3',
        kpid,
      });
      expect(kernelStore.resolveKernelPromise).toHaveBeenCalledWith(
        kpid,
        false,
        { body: 'resolved value', slots: ['slot1'] },
      );
      expect(resolveHandler).toHaveBeenCalledWith({
        body: 'resolved value',
        slots: ['slot1'],
      });
      expect(kernelQueue.subscriptions.has(kpid)).toBe(false);
    });

    it('throws error if a promise is already resolved', () => {
      const vatId = 'v1';
      const kpid = 'kp123';
      const resolution: VatOneResolution = [
        kpid,
        false,
        { body: 'resolved value', slots: [] } as CapData<KRef>,
      ];
      (kernelStore.getKernelPromise as unknown as MockInstance).mockReturnValue(
        {
          state: 'fulfilled',
          decider: vatId,
        },
      );
      expect(() => kernelQueue.resolvePromises(vatId, [resolution])).toThrow(
        '"kp123" was already resolved',
      );
    });

    it('throws error if the resolver is not the decider', () => {
      const vatId = 'v1';
      const wrongVatId = 'v2';
      const kpid = 'kp123';
      const resolution: VatOneResolution = [
        kpid,
        false,
        { body: 'resolved value', slots: [] } as CapData<KRef>,
      ];
      (kernelStore.getKernelPromise as unknown as MockInstance).mockReturnValue(
        {
          state: 'unresolved',
          decider: wrongVatId,
        },
      );
      expect(() => kernelQueue.resolvePromises(vatId, [resolution])).toThrow(
        '"v1" not permitted to resolve "kp123" because "its decider is v2"',
      );
    });
  });
});
