import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MockInstance } from 'vitest';

import { KernelQueue } from './KernelQueue.ts';
import { KernelRouter } from './KernelRouter.ts';
import type { KernelStore } from './store/index.ts';
import type {
  KernelMessage,
  RunQueueItem,
  RunQueueItemSend,
  RunQueueItemNotify,
  RunQueueItemGCAction,
  RunQueueItemBringOutYourDead,
  EndpointId,
  GCRunQueueType,
  CrankResult,
  EndpointHandle,
} from './types.ts';

describe('KernelRouter', () => {
  // Mock dependencies
  let kernelStore: KernelStore;
  let kernelQueue: KernelQueue;
  let getEndpoint: (endpointId: EndpointId) => EndpointHandle;
  let endpointHandle: EndpointHandle;
  let kernelRouter: KernelRouter;

  beforeEach(() => {
    // Mock EndpointHandle with more detailed return values
    const mockCrankResult: CrankResult = { didDelivery: 'v1' };

    endpointHandle = {
      deliverMessage: vi.fn().mockResolvedValue(mockCrankResult),
      deliverNotify: vi.fn().mockResolvedValue(mockCrankResult),
      deliverDropExports: vi.fn().mockResolvedValue(mockCrankResult),
      deliverRetireExports: vi.fn().mockResolvedValue(mockCrankResult),
      deliverRetireImports: vi.fn().mockResolvedValue(mockCrankResult),
      deliverBringOutYourDead: vi.fn().mockResolvedValue(mockCrankResult),
    } as unknown as EndpointHandle;

    // Mock getEndpoint function
    getEndpoint = vi.fn().mockReturnValue(endpointHandle);

    // Mock KernelStore
    kernelStore = {
      getOwner: vi.fn(),
      isRevoked: vi.fn(),
      getKernelPromise: vi.fn(),
      decrementRefCount: vi.fn(),
      setPromiseDecider: vi.fn(),
      translateRefKtoE: vi.fn(
        (_endpointId: string, kref: string) => `translated-${kref}`,
      ) as unknown as MockInstance,
      translateMessageKtoE: vi.fn(
        (_endpointId: string, message: KernelMessage) => message,
      ) as unknown as MockInstance,
      enqueuePromiseMessage: vi.fn(),
      erefToKref: vi.fn() as unknown as MockInstance,
      krefToEref: vi.fn() as unknown as MockInstance,
      getKpidsToRetire: vi.fn().mockReturnValue([]),
      translateCapDataKtoE: vi.fn(),
      krefsToExistingErefs: vi.fn((_endpointId: string, krefs: string[]) =>
        krefs.map((kref: string) => `translated-${kref}`),
      ) as unknown as MockInstance,
      createCrankSavepoint: vi.fn(),
    } as unknown as KernelStore;

    // Mock KernelQueue
    kernelQueue = {
      resolvePromises: vi.fn(),
    } as unknown as KernelQueue;

    const mockInvokeKernelService = vi.fn();

    // Create the router to test
    kernelRouter = new KernelRouter(
      kernelStore,
      kernelQueue,
      getEndpoint,
      mockInvokeKernelService,
    );
  });

  describe('deliver', () => {
    describe('send', () => {
      it('delivers a send message to a vat with an object target and returns crank results', async () => {
        // Setup the kernel store to return an owner for the target
        const endpointId = 'v1';
        const target = 'ko123';
        (kernelStore.getOwner as unknown as MockInstance).mockReturnValueOnce(
          endpointId,
        );

        // Create a mock crank result that the vat will return
        const mockCrankResult: CrankResult = {
          didDelivery: endpointId,
          abort: false,
        };
        (
          endpointHandle.deliverMessage as unknown as MockInstance
        ).mockResolvedValueOnce(mockCrankResult);

        // Create a send message
        const message: KernelMessage = {
          methargs: { body: 'method args', slots: ['ko1', 'ko2'] },
          result: 'kp1',
        };
        const sendItem: RunQueueItemSend = {
          type: 'send',
          target,
          message,
        };

        const result = await kernelRouter.deliver(sendItem);

        // Verify the message was delivered to the vat and results returned
        expect(getEndpoint).toHaveBeenCalledWith(endpointId);
        expect(endpointHandle.deliverMessage).toHaveBeenCalledWith(
          `translated-${target}`,
          message,
        );
        expect(result).toStrictEqual(mockCrankResult);
        expect(kernelStore.decrementRefCount).toHaveBeenCalledWith(
          'ko1',
          'deliver|send|slot',
        );
        expect(kernelStore.decrementRefCount).toHaveBeenCalledWith(
          'ko2',
          'deliver|send|slot',
        );
        expect(kernelStore.decrementRefCount).toHaveBeenCalledWith(
          target,
          'deliver|send|target',
        );
        expect(kernelStore.decrementRefCount).toHaveBeenCalledWith(
          'kp1',
          'deliver|send|result',
        );
      });

      it('splats a message when target is revoked and returns undefined', async () => {
        // Setup the kernel store to return a revoked owner for the target
        (kernelStore.isRevoked as unknown as MockInstance).mockReturnValueOnce(
          true,
        );

        // Create a send message
        const target = 'ko123';
        const message: KernelMessage = {
          methargs: { body: 'method args', slots: ['ko1', 'ko2'] },
          result: 'kp1',
        };
        const sendItem: RunQueueItemSend = {
          type: 'send',
          target,
          message,
        };
        const result = await kernelRouter.deliver(sendItem);

        // Verify the message was not delivered to any vat and resources were cleaned up
        expect(getEndpoint).not.toHaveBeenCalled();
        expect(endpointHandle.deliverMessage).not.toHaveBeenCalled();
        expect(result).toBeUndefined();

        // Verify refcounts were decremented
        expect(kernelStore.decrementRefCount).toHaveBeenCalledWith(
          target,
          'deliver|splat|target',
        );
        expect(kernelStore.decrementRefCount).toHaveBeenCalledWith(
          'ko1',
          'deliver|splat|slot',
        );
        expect(kernelStore.decrementRefCount).toHaveBeenCalledWith(
          'ko2',
          'deliver|splat|slot',
        );
        expect(kernelStore.decrementRefCount).toHaveBeenCalledWith(
          'kp1',
          'deliver|splat|result',
        );
        // Verify the promise was rejected with 'revoked object'
        expect(kernelQueue.resolvePromises).toHaveBeenCalledWith(
          undefined,
          expect.arrayContaining([
            expect.arrayContaining([
              'kp1',
              true,
              expect.objectContaining({
                body: expect.stringContaining('[KERNEL:OBJECT_REVOKED]'),
                slots: [],
              }),
            ]),
          ]),
        );
      });

      it('splats a message when target has no owner and returns undefined', async () => {
        // Setup the kernel store to return no owner for the target
        (kernelStore.getOwner as unknown as MockInstance).mockReturnValueOnce(
          null,
        );

        // Create a send message
        const target = 'ko123';
        const message: KernelMessage = {
          methargs: { body: 'method args', slots: ['ko1', 'ko2'] },
          result: 'kp1',
        };
        const sendItem: RunQueueItemSend = {
          type: 'send',
          target,
          message,
        };
        const result = await kernelRouter.deliver(sendItem);

        // Verify the message was not delivered to any vat and resources were cleaned up
        expect(getEndpoint).not.toHaveBeenCalled();
        expect(endpointHandle.deliverMessage).not.toHaveBeenCalled();
        expect(result).toBeUndefined();

        // Verify refcounts were decremented
        expect(kernelStore.decrementRefCount).toHaveBeenCalledWith(
          target,
          'deliver|splat|target',
        );
        expect(kernelStore.decrementRefCount).toHaveBeenCalledWith(
          'ko1',
          'deliver|splat|slot',
        );
        expect(kernelStore.decrementRefCount).toHaveBeenCalledWith(
          'ko2',
          'deliver|splat|slot',
        );
        expect(kernelStore.decrementRefCount).toHaveBeenCalledWith(
          'kp1',
          'deliver|splat|result',
        );
        // Verify the promise was rejected with OBJECT_DELETED
        expect(kernelQueue.resolvePromises).toHaveBeenCalledWith(
          undefined,
          expect.arrayContaining([
            expect.arrayContaining([
              'kp1',
              true,
              expect.objectContaining({
                body: expect.stringContaining('[KERNEL:OBJECT_DELETED]'),
                slots: [],
              }),
            ]),
          ]),
        );
      });

      it('enqueues a message on an unresolved promise and returns undefined', async () => {
        // Setup a promise reference and unresolved promise in the kernel store
        const target = 'kp123';
        (
          kernelStore.getKernelPromise as unknown as MockInstance
        ).mockReturnValueOnce({
          state: 'unresolved',
          value: { body: JSON.stringify({ status: 'unresolved' }), slots: [] },
        });
        // Create a send message
        const message: KernelMessage = {
          methargs: { body: 'method args', slots: [] },
          result: null,
        };
        const sendItem: RunQueueItemSend = {
          type: 'send',
          target,
          message,
        };
        const result = await kernelRouter.deliver(sendItem);

        // Verify the message was enqueued on the promise
        expect(kernelStore.enqueuePromiseMessage).toHaveBeenCalledWith(
          target,
          message,
        );
        // Verify no vat interaction occurred
        expect(getEndpoint).not.toHaveBeenCalled();
        expect(endpointHandle.deliverMessage).not.toHaveBeenCalled();
        expect(result).toBeUndefined();

        // Verify that no refcount decrementation happened since we're requeuing
        expect(kernelStore.decrementRefCount).not.toHaveBeenCalled();
      });

      it('splats message when promise resolves to a non-object', async () => {
        // Setup a fulfilled promise that doesn't resolve to an object
        const promiseId = 'kp123';

        (
          kernelStore.getKernelPromise as unknown as MockInstance
        ).mockReturnValueOnce({
          state: 'fulfilled',
          value: {
            body: JSON.stringify({ value: 'not an object' }),
            slots: [],
          },
        });

        // Create a send message to the promise
        const message: KernelMessage = {
          methargs: { body: 'method args', slots: [] },
          result: 'kp2',
        };
        const sendItem: RunQueueItemSend = {
          type: 'send',
          target: promiseId,
          message,
        };

        const result = await kernelRouter.deliver(sendItem);

        // Message should be splatted, not delivered
        expect(getEndpoint).not.toHaveBeenCalled();
        expect(endpointHandle.deliverMessage).not.toHaveBeenCalled();
        expect(result).toBeUndefined();

        // Verify the result promise was rejected with BAD_PROMISE_RESOLUTION
        expect(kernelQueue.resolvePromises).toHaveBeenCalledWith(
          undefined,
          expect.arrayContaining([
            expect.arrayContaining([
              'kp2',
              true,
              expect.objectContaining({
                body: expect.stringContaining(
                  '[KERNEL:BAD_PROMISE_RESOLUTION]',
                ),
              }),
            ]),
          ]),
        );
      });

      it('splats message when promise is rejected', async () => {
        // Setup a rejected promise
        const promiseId = 'kp123';
        const rejection = {
          body: JSON.stringify({ error: 'rejection reason' }),
          slots: [],
        };

        (
          kernelStore.getKernelPromise as unknown as MockInstance
        ).mockReturnValueOnce({
          state: 'rejected',
          value: rejection,
        });

        // Create a send message to the promise
        const message: KernelMessage = {
          methargs: { body: 'method args', slots: [] },
          result: 'kp2',
        };
        const sendItem: RunQueueItemSend = {
          type: 'send',
          target: promiseId,
          message,
        };

        const result = await kernelRouter.deliver(sendItem);

        // Message should be splatted, not delivered
        expect(getEndpoint).not.toHaveBeenCalled();
        expect(endpointHandle.deliverMessage).not.toHaveBeenCalled();
        expect(result).toBeUndefined();

        // Verify the result promise was rejected with the same reason
        expect(kernelQueue.resolvePromises).toHaveBeenCalledWith(
          undefined,
          expect.arrayContaining([
            expect.arrayContaining(['kp2', true, rejection]),
          ]),
        );
      });

      it('splats message with ENDPOINT_UNREACHABLE when endpoint vanishes', async () => {
        const endpointId = 'v1';
        const target = 'ko123';
        (kernelStore.getOwner as unknown as MockInstance).mockReturnValueOnce(
          endpointId,
        );
        // getEndpoint throws (endpoint gone)
        (getEndpoint as unknown as MockInstance).mockImplementationOnce(() => {
          throw new Error('vat not found');
        });
        (
          kernelStore.getKernelPromise as unknown as MockInstance
        ).mockReturnValueOnce({ decider: endpointId });

        const message: Message = {
          methargs: { body: 'method args', slots: [] },
          result: 'kp1',
        };
        const sendItem: RunQueueItemSend = {
          type: 'send',
          target,
          message: message as unknown as SwingsetMessage,
        };

        const result = await kernelRouter.deliver(sendItem);

        expect(result).toBeUndefined();
        expect(kernelQueue.resolvePromises).toHaveBeenCalledWith(
          endpointId,
          expect.arrayContaining([
            expect.arrayContaining([
              'kp1',
              true,
              expect.objectContaining({
                body: expect.stringContaining('[KERNEL:ENDPOINT_UNREACHABLE]'),
              }),
            ]),
          ]),
        );
      });

      it('rejects with DELIVERY_FAILED when endpoint.deliverMessage throws', async () => {
        const endpointId = 'v1';
        const target = 'ko123';
        (kernelStore.getOwner as unknown as MockInstance).mockReturnValueOnce(
          endpointId,
        );
        (
          endpointHandle.deliverMessage as unknown as MockInstance
        ).mockRejectedValueOnce(new Error('queue full'));

        const message: Message = {
          methargs: { body: 'method args', slots: [] },
          result: 'kp1',
        };
        const sendItem: RunQueueItemSend = {
          type: 'send',
          target,
          message: message as unknown as SwingsetMessage,
        };

        await kernelRouter.deliver(sendItem);

        expect(kernelQueue.resolvePromises).toHaveBeenCalledWith(
          endpointId,
          expect.arrayContaining([
            expect.arrayContaining([
              'kp1',
              true,
              expect.objectContaining({
                body: expect.stringContaining('[KERNEL:DELIVERY_FAILED]'),
              }),
            ]),
          ]),
        );
      });
    });

    describe('notify', () => {
      it('delivers a notify to a vat and returns crank results', async () => {
        const endpointId = 'v1';
        const kpid = 'kp123';
        const notifyItem: RunQueueItemNotify = {
          type: 'notify',
          endpointId,
          kpid,
        };

        // Mock a resolved promise
        (
          kernelStore.getKernelPromise as unknown as MockInstance
        ).mockReturnValueOnce({
          state: 'fulfilled',
          value: {
            body: JSON.stringify({ value: 'resolved value' }),
            slots: [],
          },
        });

        // Mock that this promise is in the vat's clist
        (kernelStore.krefToEref as unknown as MockInstance).mockReturnValueOnce(
          'p+123',
        );

        // Mock that there's a promise to retire
        (
          kernelStore.getKpidsToRetire as unknown as MockInstance
        ).mockReturnValueOnce([kpid]);

        // Mock the getKernelPromise for the target promise
        (
          kernelStore.getKernelPromise as unknown as MockInstance
        ).mockReturnValueOnce({
          state: 'fulfilled',
          value: {
            body: JSON.stringify({ value: 'target promise value' }),
            slots: [],
          },
        });

        // Mock crank results
        const mockCrankResult: CrankResult = { didDelivery: endpointId };
        (
          endpointHandle.deliverNotify as unknown as MockInstance
        ).mockResolvedValueOnce(mockCrankResult);

        // Deliver the notify
        const result = await kernelRouter.deliver(notifyItem);

        // Verify the notification was delivered to the vat
        expect(getEndpoint).toHaveBeenCalledWith(endpointId);
        expect(endpointHandle.deliverNotify).toHaveBeenCalledWith(
          expect.any(Array),
        );
        expect(kernelStore.decrementRefCount).toHaveBeenCalledWith(
          kpid,
          'deliver|notify',
        );
        expect(result).toStrictEqual(mockCrankResult);
      });

      it('returns didDelivery when promise is not in vat clist', async () => {
        const endpointId = 'v1';
        const kpid = 'kp123';
        const notifyItem: RunQueueItemNotify = {
          type: 'notify',
          endpointId,
          kpid,
        };

        // Mock a resolved promise
        (
          kernelStore.getKernelPromise as unknown as MockInstance
        ).mockReturnValueOnce({
          state: 'fulfilled',
          value: {
            body: JSON.stringify({ value: 'resolved value' }),
            slots: [],
          },
        });

        // Mock that this promise is NOT in the vat's clist
        (kernelStore.krefToEref as unknown as MockInstance).mockReturnValueOnce(
          null,
        );

        // Deliver the notify
        const result = await kernelRouter.deliver(notifyItem);

        // Verify no notification was delivered to the vat
        expect(endpointHandle.deliverNotify).not.toHaveBeenCalled();
        expect(result).toStrictEqual({ didDelivery: endpointId });
      });

      it('returns didDelivery when no kpids to retire', async () => {
        const endpointId = 'v1';
        const kpid = 'kp123';
        const notifyItem: RunQueueItemNotify = {
          type: 'notify',
          endpointId,
          kpid,
        };

        // Mock a resolved promise
        (
          kernelStore.getKernelPromise as unknown as MockInstance
        ).mockReturnValueOnce({
          state: 'fulfilled',
          value: {
            body: JSON.stringify({ value: 'resolved value' }),
            slots: [],
          },
        });

        // Mock that this promise is in the vat's clist
        (kernelStore.krefToEref as unknown as MockInstance).mockReturnValueOnce(
          'p+123',
        );

        // Mock that there are no promises to retire
        (
          kernelStore.getKpidsToRetire as unknown as MockInstance
        ).mockReturnValueOnce([]);

        // Deliver the notify
        const result = await kernelRouter.deliver(notifyItem);

        // Verify no notification was delivered to the vat
        expect(endpointHandle.deliverNotify).not.toHaveBeenCalled();
        expect(result).toStrictEqual({ didDelivery: endpointId });
      });

      it('throws if notification is for an unresolved promise', async () => {
        const endpointId = 'v1';
        const kpid = 'kp123';
        const notifyItem: RunQueueItemNotify = {
          type: 'notify',
          endpointId,
          kpid,
        };

        // Mock an unresolved promise with no value
        (
          kernelStore.getKernelPromise as unknown as MockInstance
        ).mockReturnValueOnce({
          state: 'unresolved',
          value: null,
        });

        // Deliver the notify should throw with the expected error message
        await expect(kernelRouter.deliver(notifyItem)).rejects.toThrow(
          'no value for promise kp123',
        );
      });
    });

    describe('gc actions', () => {
      it.each([
        ['dropExports', 'deliverDropExports'],
        ['retireExports', 'deliverRetireExports'],
        ['retireImports', 'deliverRetireImports'],
      ])(
        'delivers %s to a vat and returns crank results',
        async (actionType, deliverMethod) => {
          const endpointId = 'v1';
          const krefs = ['ko1', 'ko2'];
          const gcAction: RunQueueItemGCAction = {
            type: actionType as GCRunQueueType,
            endpointId,
            krefs,
          };

          // Mock crank results
          const mockCrankResult: CrankResult = { didDelivery: endpointId };
          (
            endpointHandle[
              deliverMethod as keyof EndpointHandle
            ] as unknown as MockInstance
          ).mockResolvedValueOnce(mockCrankResult);

          // Deliver the GC action
          const result = await kernelRouter.deliver(gcAction);

          // Verify the action was delivered to the vat
          expect(getEndpoint).toHaveBeenCalledWith(endpointId);
          expect(
            endpointHandle[deliverMethod as keyof EndpointHandle],
          ).toHaveBeenCalledWith(krefs.map((kref) => `translated-${kref}`));
          expect(result).toStrictEqual(mockCrankResult);
        },
      );
    });

    describe('bringOutYourDead', () => {
      it('delivers bringOutYourDead to a vat and returns crank results', async () => {
        const endpointId = 'v1';
        const bringOutYourDeadItem: RunQueueItemBringOutYourDead = {
          type: 'bringOutYourDead',
          endpointId,
        };

        // Mock crank results
        const mockCrankResult: CrankResult = { didDelivery: endpointId };
        (
          endpointHandle.deliverBringOutYourDead as unknown as MockInstance
        ).mockResolvedValueOnce(mockCrankResult);

        // Deliver the bringOutYourDead action
        const result = await kernelRouter.deliver(bringOutYourDeadItem);

        // Verify the action was delivered to the endpoint
        expect(getEndpoint).toHaveBeenCalledWith(endpointId);
        expect(endpointHandle.deliverBringOutYourDead).toHaveBeenCalled();
        expect(result).toStrictEqual(mockCrankResult);
      });
    });

    describe('an endpoint named by persisted state that is not running', () => {
      // A vat is addressable without being live: boot skips one whose code can
      // no longer be loaded (`VatManager.#restoreVat`), and a terminated vat's
      // ownership entries outlive it until cleanup. Its c-lists and reachable
      // flags stay in the store, so the kernel goes on addressing it — and
      // unlike a send, none of these deliveries has a caller to reject.
      const endpointId = 'v2';

      beforeEach(() => {
        (getEndpoint as unknown as MockInstance).mockImplementation(
          (requested: EndpointId) => {
            if (requested === endpointId) {
              throw new Error(`Vat not found: ${requested}`);
            }
            return endpointHandle;
          },
        );
      });

      /**
       * Set up a notify whose promise is resolved and still in the endpoint's
       * c-list, so delivery is reached rather than short-circuited.
       *
       * @returns The notify item to deliver.
       */
      const makeLiveNotify = (): RunQueueItemNotify => {
        const kpid = 'kp123';
        (
          kernelStore.getKernelPromise as unknown as MockInstance
        ).mockReturnValue({
          state: 'fulfilled',
          value: { body: JSON.stringify({ value: 'v' }), slots: [] },
        });
        (kernelStore.krefToEref as unknown as MockInstance).mockReturnValue(
          'p+123',
        );
        (
          kernelStore.getKpidsToRetire as unknown as MockInstance
        ).mockReturnValue([kpid]);
        return { type: 'notify', endpointId, kpid };
      };

      it.each([
        [
          'notify',
          (): RunQueueItem => makeLiveNotify(),
          'deliverNotify' as const,
        ],
        [
          'dropExports',
          (): RunQueueItem => ({
            type: 'dropExports' as GCRunQueueType,
            endpointId,
            krefs: ['ko1'],
          }),
          'deliverDropExports' as const,
        ],
        [
          'bringOutYourDead',
          (): RunQueueItem => ({ type: 'bringOutYourDead', endpointId }),
          'deliverBringOutYourDead' as const,
        ],
      ])(
        'skips a %s addressed to it instead of throwing out of the crank',
        async (_what, makeItem, deliverMethod) => {
          // Throwing here would escape the crank and kill the run loop for
          // good — and because the crank is rolled back, the same item is
          // re-dequeued on the next boot and kills that one too.
          const result = await kernelRouter.deliver(makeItem());

          expect(result).toStrictEqual({ didDelivery: endpointId });
          expect(
            endpointHandle[deliverMethod as keyof EndpointHandle],
          ).not.toHaveBeenCalled();
        },
      );

      it('still releases the notify’s own reference when it is skipped', async () => {
        const notifyItem = makeLiveNotify();

        await kernelRouter.deliver(notifyItem);

        // `enqueueNotify` took a reference for this item; an endpoint that is
        // not there to be told is no reason to hold it forever.
        expect(kernelStore.decrementRefCount).toHaveBeenCalledWith(
          notifyItem.kpid,
          'deliver|notify',
        );
      });

      it('still delivers to endpoints that are running', async () => {
        const result = await kernelRouter.deliver({
          type: 'bringOutYourDead',
          endpointId: 'v1',
        });

        expect(endpointHandle.deliverBringOutYourDead).toHaveBeenCalled();
        expect(result).toStrictEqual({ didDelivery: 'v1' });
      });
    });

    it('throws on unknown run queue item type', async () => {
      // @ts-expect-error - deliberately using an invalid type
      const invalidItem: RunQueueItem = { type: 'invalid' };
      await expect(kernelRouter.deliver(invalidItem)).rejects.toThrow(
        'unsupported or unknown run queue item type',
      );
    });
  });
});
