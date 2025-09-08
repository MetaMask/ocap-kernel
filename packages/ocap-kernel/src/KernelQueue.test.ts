import type { VatOneResolution } from '@agoric/swingset-liveslots';
import type { CapData } from '@endo/marshal';
import { makePromiseKit } from '@endo/promise-kit';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MockInstance } from 'vitest';

import { KernelQueue } from './KernelQueue.ts';
import * as gc from './services/garbage-collection.ts';
import type { KernelStore } from './store/index.ts';
import * as types from './types.ts';
import type { KRef, Message, RunQueueItem } from './types.ts';

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
      resolveKernelPromise: vi.fn(),
      nextReapAction: vi.fn().mockReturnValue(null),
      getGCActions: vi.fn().mockReturnValue([]),
      startCrank: vi.fn(),
      endCrank: vi.fn(),
      createCrankSavepoint: vi.fn(),
      rollbackCrank: vi.fn(),
      waitForCrank: vi.fn(),
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
        message: {} as Message,
      };
      (kernelStore.runQueueLength as unknown as MockInstance)
        .mockReturnValueOnce(1)
        .mockReturnValue(0);
      (kernelStore.dequeueRun as unknown as MockInstance).mockReturnValueOnce(
        mockItem,
      );
      const deliver = vi.fn().mockResolvedValue({ abort: true });
      const collectGarbageError = new Error(
        'wakeUpTheRunQueue function already set',
      );
      (kernelStore.collectGarbage as unknown as MockInstance).mockRejectedValue(
        collectGarbageError,
      );
      await expect(kernelQueue.run(deliver)).rejects.toThrow(
        collectGarbageError.message,
      );
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
      const terminateInfo = { vatId: 'v1', info: { body: '"test"' } };
      (kernelStore.runQueueLength as unknown as MockInstance)
        .mockReturnValueOnce(1)
        .mockReturnValue(0);
      (kernelStore.dequeueRun as unknown as MockInstance).mockReturnValueOnce(
        mockItem,
      );
      const deliver = vi.fn().mockResolvedValue({ terminate: terminateInfo });
      const collectGarbageError = new Error(
        'wakeUpTheRunQueue function already set',
      );
      (kernelStore.collectGarbage as unknown as MockInstance).mockRejectedValue(
        collectGarbageError,
      );
      await expect(kernelQueue.run(deliver)).rejects.toThrow(
        collectGarbageError.message,
      );
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
      const endpointId = 'v1';
      const kpid = 'kp123';
      kernelQueue.enqueueNotify(endpointId, kpid);
      expect(kernelStore.enqueueRun).toHaveBeenCalledWith({
        type: 'notify',
        endpointId,
        kpid,
      });
      expect(kernelStore.incrementRefCount).toHaveBeenCalledWith(
        kpid,
        'notify',
      );
    });
  });

  describe('resolvePromises', () => {
    it('resolves kernel promises and notifies subscribers', () => {
      const endpointId = 'v1';
      const kpid = 'kp123';
      const resolution: VatOneResolution = [
        kpid,
        false,
        { body: 'resolved value', slots: ['slot1'] } as CapData<KRef>,
      ];
      (kernelStore.getKernelPromise as unknown as MockInstance).mockReturnValue(
        {
          state: 'unresolved',
          decider: endpointId,
          subscribers: ['v2', 'v3'],
        },
      );
      const resolveHandler = vi.fn();
      kernelQueue.subscriptions.set(kpid, resolveHandler);
      kernelQueue.resolvePromises(endpointId, [resolution]);
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
        endpointId: 'v2',
        kpid,
      });
      expect(kernelStore.enqueueRun).toHaveBeenCalledWith({
        type: 'notify',
        endpointId: 'v3',
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

    it('handles resolutions with undefined vatId (kernel decider)', () => {
      const kpid = 'kp123';
      const resolution: VatOneResolution = [
        kpid,
        false,
        { body: 'resolved value', slots: ['slot1'] } as CapData<KRef>,
      ];
      (kernelStore.getKernelPromise as unknown as MockInstance).mockReturnValue(
        {
          state: 'unresolved',
          decider: undefined,
          subscribers: ['v2'],
        },
      );
      const resolveHandler = vi.fn();
      kernelQueue.subscriptions.set(kpid, resolveHandler);
      const insistEndpointIdSpy = vi.spyOn(types, 'insistEndpointId');
      kernelQueue.resolvePromises(undefined, [resolution]);
      expect(insistEndpointIdSpy).not.toHaveBeenCalled();
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
        endpointId: 'v2',
        kpid,
      });
      expect(kernelStore.resolveKernelPromise).toHaveBeenCalledWith(
        kpid,
        false,
        resolution[2],
      );
      expect(resolveHandler).toHaveBeenCalledWith(resolution[2]);
      expect(kernelQueue.subscriptions.has(kpid)).toBe(false);
      insistEndpointIdSpy.mockRestore();
    });

    it('handles promises with no subscribers', () => {
      const endpointId = 'v1';
      const kpid = 'kpNoSubscribers';
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
      kernelQueue.subscriptions.set(kpid, resolveHandler);
      kernelQueue.resolvePromises(endpointId, [resolution]);
      expect(kernelStore.enqueueRun).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'notify' }),
      );
      expect(kernelStore.resolveKernelPromise).toHaveBeenCalledWith(
        kpid,
        false,
        resolution[2],
      );
      expect(resolveHandler).toHaveBeenCalledWith(resolution[2]);
      expect(kernelQueue.subscriptions.has(kpid)).toBe(false);
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

  describe('waitForCrank', () => {
    it('should handle when waitForCrank returns a delayed promise', async () => {
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
