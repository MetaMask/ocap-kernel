import type { VatOneResolution } from '@agoric/swingset-liveslots';
import type { CapData } from '@endo/marshal';
import { makePromiseKit } from '@endo/promise-kit';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MockInstance } from 'vitest';

import * as gc from './garbage-collection/garbage-collection.ts';
import { KernelQueue } from './KernelQueue.ts';
import type { KernelStore } from './store/index.ts';
import * as types from './types.ts';
import type { KRef, Message, RunQueueItem } from './types.ts';

vi.mock('./garbage-collection/garbage-collection.ts', () => ({
  processGCActionSet: vi.fn().mockReturnValue(null),
}));

vi.mock('@endo/promise-kit', () => ({
  makePromiseKit: vi.fn(),
}));

/**
 * Sentinel error used to stop the infinite run loop in tests.
 * Thrown by collectGarbage (which runs after each delivery) so the
 * test can assert on the side-effects of that delivery.
 */
const STOP_RUN_LOOP = 'test: stop run loop';

describe('KernelQueue', () => {
  let kernelStore: KernelStore;
  let kernelQueue: KernelQueue;
  let mockPromiseKit: ReturnType<typeof makePromiseKit>;
  let terminateVat: (vatId: string, reason?: CapData<KRef>) => Promise<void>;

  beforeEach(() => {
    mockPromiseKit = {
      promise: Promise.resolve(),
      resolve: vi.fn(),
      reject: vi.fn(),
    };
    (makePromiseKit as unknown as MockInstance).mockReturnValue(mockPromiseKit);

    terminateVat = vi.fn().mockResolvedValue(undefined);

    kernelStore = {
      nextTerminatedVatCleanup: vi.fn(),
      collectGarbage: vi.fn(),
      runQueueLength: vi.fn(),
      dequeueRun: vi.fn(),
      enqueueRun: vi.fn(),
      initKernelPromise: vi.fn().mockReturnValue(['kp1']),
      incrementRefCount: vi.fn(),
      getKernelPromise: vi.fn(),
      resolveKernelPromise: vi.fn().mockReturnValue([]),
      nextReapAction: vi.fn().mockReturnValue(null),
      getGCActions: vi.fn().mockReturnValue([]),
      startCrank: vi.fn(),
      endCrank: vi.fn(),
      createCrankSavepoint: vi.fn(),
      rollbackCrank: vi.fn(),
      waitForCrank: vi.fn(),
      // Crank buffer methods
      bufferCrankOutput: vi.fn(),
      flushCrankBuffer: vi.fn().mockReturnValue([]),
    } as unknown as KernelStore;

    kernelQueue = new KernelQueue(kernelStore, terminateVat);
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
      const processGCActionSetSpy = vi.spyOn(gc, 'processGCActionSet');
      const deliverError = new Error('stop');
      const deliver = vi.fn().mockRejectedValue(deliverError);
      await expect(kernelQueue.run(deliver)).rejects.toBe(deliverError);
      expect(kernelStore.startCrank).toHaveBeenCalled();
      expect(kernelStore.createCrankSavepoint).toHaveBeenCalledWith('start');
      expect(processGCActionSetSpy).toHaveBeenCalled();
      expect(kernelStore.nextReapAction).toHaveBeenCalled();
      expect(kernelStore.nextTerminatedVatCleanup).toHaveBeenCalled();
      expect(deliver).toHaveBeenCalledWith(mockItem);
      expect(kernelStore.endCrank).toHaveBeenCalled();
    });

    it('rolls back crank when deliver returns abort', async () => {
      const mockItem: RunQueueItem = {
        type: 'send',
        target: 'ko123',
        message: { result: 'kp99' } as Message,
      };
      (kernelStore.runQueueLength as unknown as MockInstance)
        .mockReturnValueOnce(1)
        .mockReturnValue(0);
      (kernelStore.dequeueRun as unknown as MockInstance).mockReturnValueOnce(
        mockItem,
      );
      const deliver = vi.fn().mockResolvedValue({ abort: true });
      (
        kernelStore.collectGarbage as unknown as MockInstance
      ).mockImplementation(() => {
        throw new Error(STOP_RUN_LOOP);
      });
      await expect(kernelQueue.run(deliver)).rejects.toThrow(STOP_RUN_LOOP);
      expect(kernelStore.startCrank).toHaveBeenCalled();
      expect(kernelStore.createCrankSavepoint).toHaveBeenCalledWith('start');
      expect(deliver).toHaveBeenCalledWith(mockItem);
      expect(kernelStore.rollbackCrank).toHaveBeenCalledWith('start');
      expect(kernelStore.collectGarbage).toHaveBeenCalled();
      expect(kernelStore.endCrank).toHaveBeenCalled();
    });

    it('terminates vat when deliver returns terminate', async () => {
      const mockItem: RunQueueItem = {
        type: 'send',
        target: 'ko123',
        message: {} as Message,
      };
      const terminateInfo = {
        vatId: 'v1',
        info: { body: '"test"', slots: [] },
      };
      (kernelStore.runQueueLength as unknown as MockInstance)
        .mockReturnValueOnce(1)
        .mockReturnValue(0);
      (kernelStore.dequeueRun as unknown as MockInstance).mockReturnValueOnce(
        mockItem,
      );
      const deliver = vi.fn().mockResolvedValue({ terminate: terminateInfo });
      (
        kernelStore.collectGarbage as unknown as MockInstance
      ).mockImplementation(() => {
        throw new Error(STOP_RUN_LOOP);
      });
      await expect(kernelQueue.run(deliver)).rejects.toThrow(STOP_RUN_LOOP);
      expect(kernelStore.startCrank).toHaveBeenCalled();
      expect(deliver).toHaveBeenCalledWith(mockItem);
      expect(terminateVat).toHaveBeenCalledWith(
        terminateInfo.vatId,
        terminateInfo.info,
      );
      expect(kernelStore.collectGarbage).toHaveBeenCalled();
      expect(kernelStore.endCrank).toHaveBeenCalled();
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
        reject: vi.fn(),
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
      const subscription = kernelQueue.subscriptions.get('kp1');
      expect(subscription).toStrictEqual({
        resolve: expect.any(Function),
        reject: expect.any(Function),
      });
      resolvePromise(resultValue);
      const result = await resultPromise;
      expect(result).toStrictEqual(resultValue);
    });
  });

  describe('enqueueSend', () => {
    it('enqueues a send message and increments reference counts', () => {
      const target = 'ko123';
      const message: Message = {
        methargs: { body: 'method args', slots: ['ko1', 'ko2'] },
        result: 'kp2',
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
        'ko1',
        'queue|slot',
      );
      expect(kernelStore.incrementRefCount).toHaveBeenCalledWith(
        'ko2',
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
    it('enqueues a notify and increments refcount', () => {
      const endpointId = 'v1';
      const kpid = 'kp123';
      kernelQueue.enqueueNotify(endpointId, kpid);
      expect(kernelStore.incrementRefCount).toHaveBeenCalledWith(
        kpid,
        'notify',
      );
      expect(kernelStore.enqueueRun).toHaveBeenCalledWith({
        type: 'notify',
        endpointId,
        kpid,
      });
    });
  });

  describe('resolvePromises', () => {
    it('resolves kernel promises and buffers notifications for subscribers', () => {
      const endpointId = 'v1';
      const kpid = 'kp123';
      const resolution: VatOneResolution = [
        kpid,
        false,
        { body: 'resolved value', slots: ['ko1'] } as CapData<KRef>,
      ];
      (kernelStore.getKernelPromise as unknown as MockInstance).mockReturnValue(
        {
          state: 'unresolved',
          decider: endpointId,
          subscribers: ['v2', 'v3'],
        },
      );
      const resolveHandler = vi.fn();
      const rejectHandler = vi.fn();
      kernelQueue.subscriptions.set(kpid, {
        resolve: resolveHandler,
        reject: rejectHandler,
      });
      kernelQueue.resolvePromises(endpointId, [resolution], false);
      expect(kernelStore.incrementRefCount).toHaveBeenCalledWith(
        kpid,
        'resolve|kpid',
      );
      expect(kernelStore.incrementRefCount).toHaveBeenCalledWith(
        'ko1',
        'resolve|slot',
      );
      // Notifications are buffered with refcount increments
      expect(kernelStore.incrementRefCount).toHaveBeenCalledWith(
        kpid,
        'notify',
      );
      expect(kernelStore.bufferCrankOutput).toHaveBeenCalledWith({
        type: 'notify',
        endpointId: 'v2',
        kpid,
      });
      expect(kernelStore.bufferCrankOutput).toHaveBeenCalledWith({
        type: 'notify',
        endpointId: 'v3',
        kpid,
      });
      expect(kernelStore.resolveKernelPromise).toHaveBeenCalledWith(
        kpid,
        false,
        { body: 'resolved value', slots: ['ko1'] },
      );
      // Kernel subscription callback is NOT called immediately - deferred to flush
      expect(resolveHandler).not.toHaveBeenCalled();
      // Subscription is still registered, will be invoked during flush
      expect(kernelQueue.subscriptions.has(kpid)).toBe(true);
    });

    it('handles resolutions with undefined vatId (kernel decider)', () => {
      const kpid = 'kp123';
      const resolution: VatOneResolution = [
        kpid,
        false,
        { body: 'resolved value', slots: ['ko1'] } as CapData<KRef>,
      ];
      (kernelStore.getKernelPromise as unknown as MockInstance).mockReturnValue(
        {
          state: 'unresolved',
          decider: undefined,
          subscribers: ['v2'],
        },
      );
      const resolveHandler = vi.fn();
      const rejectHandler = vi.fn();
      kernelQueue.subscriptions.set(kpid, {
        resolve: resolveHandler,
        reject: rejectHandler,
      });
      const insistEndpointIdSpy = vi.spyOn(types, 'insistEndpointId');
      kernelQueue.resolvePromises(undefined, [resolution], false);
      expect(insistEndpointIdSpy).not.toHaveBeenCalled();
      expect(kernelStore.incrementRefCount).toHaveBeenCalledWith(
        kpid,
        'resolve|kpid',
      );
      expect(kernelStore.incrementRefCount).toHaveBeenCalledWith(
        'ko1',
        'resolve|slot',
      );
      // Notification is buffered with refcount increment
      expect(kernelStore.incrementRefCount).toHaveBeenCalledWith(
        kpid,
        'notify',
      );
      expect(kernelStore.bufferCrankOutput).toHaveBeenCalledWith({
        type: 'notify',
        endpointId: 'v2',
        kpid,
      });
      expect(kernelStore.resolveKernelPromise).toHaveBeenCalledWith(
        kpid,
        false,
        resolution[2],
      );
      // Kernel subscription callback is NOT called immediately - deferred to flush
      expect(resolveHandler).not.toHaveBeenCalled();
      expect(kernelQueue.subscriptions.has(kpid)).toBe(true);
      insistEndpointIdSpy.mockRestore();
    });

    it('handles promises with no subscribers', () => {
      const endpointId = 'v1';
      const kpid = 'kp3';
      const resolution: VatOneResolution = [
        kpid,
        false,
        { body: 'resolved value', slots: [] } as CapData<KRef>,
      ];
      (kernelStore.getKernelPromise as unknown as MockInstance).mockReturnValue(
        {
          state: 'unresolved',
          decider: endpointId,
          subscribers: [],
        },
      );
      const resolveHandler = vi.fn();
      const rejectHandler = vi.fn();
      kernelQueue.subscriptions.set(kpid, {
        resolve: resolveHandler,
        reject: rejectHandler,
      });
      kernelQueue.resolvePromises(endpointId, [resolution], false);
      // No notifications buffered because no subscribers
      expect(kernelStore.bufferCrankOutput).not.toHaveBeenCalled();
      expect(kernelStore.resolveKernelPromise).toHaveBeenCalledWith(
        kpid,
        false,
        resolution[2],
      );
      // Kernel subscription callback is NOT called immediately - deferred to flush
      expect(resolveHandler).not.toHaveBeenCalled();
      expect(kernelQueue.subscriptions.has(kpid)).toBe(true);
    });

    it('throws error if a promise is already resolved', () => {
      const endpointId = 'v1';
      const kpid = 'kp123';
      const resolution: VatOneResolution = [
        kpid,
        false,
        { body: 'resolved value', slots: [] } as CapData<KRef>,
      ];
      (kernelStore.getKernelPromise as unknown as MockInstance).mockReturnValue(
        {
          state: 'fulfilled',
          decider: endpointId,
        },
      );
      expect(() =>
        kernelQueue.resolvePromises(endpointId, [resolution]),
      ).toThrow('"kp123" was already resolved');
    });

    it('throws error if the resolver is not the decider', () => {
      const endpointId = 'v1';
      const wrongEndpointId = 'v2';
      const kpid = 'kp123';
      const resolution: VatOneResolution = [
        kpid,
        false,
        { body: 'resolved value', slots: [] } as CapData<KRef>,
      ];
      (kernelStore.getKernelPromise as unknown as MockInstance).mockReturnValue(
        {
          state: 'unresolved',
          decider: wrongEndpointId,
        },
      );
      expect(() =>
        kernelQueue.resolvePromises(endpointId, [resolution]),
      ).toThrow(
        '"v1" not permitted to resolve "kp123" because "its decider is v2"',
      );
    });
  });

  describe('abort with terminate', () => {
    it('rejects the JS subscription for the aborted send item', async () => {
      const rejectSpy = vi.fn();
      kernelQueue.subscriptions.set('kp99', {
        resolve: vi.fn(),
        reject: rejectSpy,
      });
      const mockItem: RunQueueItem = {
        type: 'send',
        target: 'ko123',
        message: { result: 'kp99' } as Message,
      };
      const terminateInfo = {
        body: '"vat terminated"',
        slots: [],
      };
      (kernelStore.runQueueLength as unknown as MockInstance)
        .mockReturnValueOnce(1)
        .mockReturnValue(0);
      (kernelStore.dequeueRun as unknown as MockInstance).mockReturnValueOnce(
        mockItem,
      );
      const deliver = vi.fn().mockResolvedValue({
        abort: true,
        terminate: { vatId: 'v1', info: terminateInfo },
      });
      (
        kernelStore.collectGarbage as unknown as MockInstance
      ).mockImplementation(() => {
        throw new Error(STOP_RUN_LOOP);
      });
      await expect(kernelQueue.run(deliver)).rejects.toThrow(STOP_RUN_LOOP);
      expect(kernelStore.rollbackCrank).toHaveBeenCalledWith('start');
      expect(rejectSpy).toHaveBeenCalledWith(terminateInfo);
      expect(kernelQueue.subscriptions.has('kp99')).toBe(false);
    });

    it('preserves the subscription when abort without terminate', async () => {
      const resolveSpy = vi.fn();
      const rejectSpy = vi.fn();
      kernelQueue.subscriptions.set('kp99', {
        resolve: resolveSpy,
        reject: rejectSpy,
      });
      const mockItem: RunQueueItem = {
        type: 'send',
        target: 'ko123',
        message: { result: 'kp99' } as Message,
      };
      (kernelStore.runQueueLength as unknown as MockInstance)
        .mockReturnValueOnce(1)
        .mockReturnValue(0);
      (kernelStore.dequeueRun as unknown as MockInstance).mockReturnValueOnce(
        mockItem,
      );
      const deliver = vi.fn().mockResolvedValue({ abort: true });
      (
        kernelStore.collectGarbage as unknown as MockInstance
      ).mockImplementation(() => {
        throw new Error(STOP_RUN_LOOP);
      });
      await expect(kernelQueue.run(deliver)).rejects.toThrow(STOP_RUN_LOOP);
      expect(kernelStore.rollbackCrank).toHaveBeenCalledWith('start');
      expect(rejectSpy).not.toHaveBeenCalled();
      expect(resolveSpy).not.toHaveBeenCalled();
      expect(kernelQueue.subscriptions.has('kp99')).toBe(true);
    });
  });

  describe('one-item-per-crank', () => {
    it('calls startCrank/endCrank for each delivered item', async () => {
      const items: RunQueueItem[] = [
        { type: 'send', target: 'ko1', message: {} as Message },
        { type: 'send', target: 'ko2', message: {} as Message },
      ];
      let dequeueCount = 0;
      (
        kernelStore.runQueueLength as unknown as MockInstance
      ).mockImplementation(() => (dequeueCount < items.length ? 1 : 0));
      (kernelStore.dequeueRun as unknown as MockInstance).mockImplementation(
        () => {
          const item = items[dequeueCount];
          dequeueCount += 1;
          return item;
        },
      );
      let deliverCount = 0;
      const deliver = vi.fn().mockImplementation(async () => {
        deliverCount += 1;
        if (deliverCount >= items.length) {
          return Promise.reject(new Error('done'));
        }
        return Promise.resolve(undefined);
      });
      await expect(kernelQueue.run(deliver)).rejects.toThrow('done');
      // Two items delivered = two cranks = two startCrank + two endCrank calls
      expect(kernelStore.startCrank).toHaveBeenCalledTimes(2);
      expect(kernelStore.endCrank).toHaveBeenCalledTimes(2);
      expect(deliver).toHaveBeenCalledTimes(2);
    });
  });

  describe('invokeKernelSubscription', () => {
    it('calls reject for rejected promises', async () => {
      const rejectSpy = vi.fn();
      const resolveSpy = vi.fn();
      kernelQueue.subscriptions.set('kp1', {
        resolve: resolveSpy,
        reject: rejectSpy,
      });
      const rejectedValue = { body: '"error"', slots: [] };
      (kernelStore.flushCrankBuffer as unknown as MockInstance).mockReturnValue(
        [{ type: 'notify', endpointId: 'v1', kpid: 'kp1' }],
      );
      (kernelStore.getKernelPromise as unknown as MockInstance).mockReturnValue(
        {
          state: 'rejected',
          value: rejectedValue,
        },
      );
      const mockItem: RunQueueItem = {
        type: 'send',
        target: 'ko1',
        message: {} as Message,
      };
      (kernelStore.runQueueLength as unknown as MockInstance)
        .mockReturnValueOnce(1)
        .mockReturnValue(0);
      (kernelStore.dequeueRun as unknown as MockInstance).mockReturnValueOnce(
        mockItem,
      );
      const deliver = vi.fn().mockResolvedValue(undefined);
      (
        kernelStore.collectGarbage as unknown as MockInstance
      ).mockImplementation(() => {
        throw new Error(STOP_RUN_LOOP);
      });
      await expect(kernelQueue.run(deliver)).rejects.toThrow(STOP_RUN_LOOP);
      expect(rejectSpy).toHaveBeenCalledWith(rejectedValue);
      expect(resolveSpy).not.toHaveBeenCalled();
    });

    it('calls resolve for fulfilled promises', async () => {
      const rejectSpy = vi.fn();
      const resolveSpy = vi.fn();
      kernelQueue.subscriptions.set('kp1', {
        resolve: resolveSpy,
        reject: rejectSpy,
      });
      const fulfilledValue = { body: '"ok"', slots: [] };
      (kernelStore.flushCrankBuffer as unknown as MockInstance).mockReturnValue(
        [{ type: 'notify', endpointId: 'v1', kpid: 'kp1' }],
      );
      (kernelStore.getKernelPromise as unknown as MockInstance).mockReturnValue(
        {
          state: 'fulfilled',
          value: fulfilledValue,
        },
      );
      const mockItem: RunQueueItem = {
        type: 'send',
        target: 'ko1',
        message: {} as Message,
      };
      (kernelStore.runQueueLength as unknown as MockInstance)
        .mockReturnValueOnce(1)
        .mockReturnValue(0);
      (kernelStore.dequeueRun as unknown as MockInstance).mockReturnValueOnce(
        mockItem,
      );
      const deliver = vi.fn().mockResolvedValue(undefined);
      (
        kernelStore.collectGarbage as unknown as MockInstance
      ).mockImplementation(() => {
        throw new Error(STOP_RUN_LOOP);
      });
      await expect(kernelQueue.run(deliver)).rejects.toThrow(STOP_RUN_LOOP);
      expect(resolveSpy).toHaveBeenCalledWith(fulfilledValue);
      expect(rejectSpy).not.toHaveBeenCalled();
    });
  });

  describe('waitForCrank', () => {
    it('handles when waitForCrank returns a delayed promise', async () => {
      let resolvePromise: ((value: void) => void) | undefined;
      const delayedPromise = new Promise<void>((resolve) => {
        resolvePromise = resolve;
      });
      (kernelStore.waitForCrank as unknown as MockInstance).mockReturnValue(
        delayedPromise,
      );
      const waitPromise = kernelQueue.waitForCrank();
      const raceResult = await Promise.race([
        waitPromise,
        Promise.resolve('immediate'),
      ]);
      expect(raceResult).toBe('immediate');
      resolvePromise?.();
      await waitPromise;
      expect(kernelStore.waitForCrank).toHaveBeenCalledOnce();
    });
  });
});
