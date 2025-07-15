import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MockInstance } from 'vitest';

import { KernelQueue } from './KernelQueue.ts';
import { KernelRouter } from './KernelRouter.ts';
import type { KernelStore } from './store/index.ts';
import type {
  Message as SwingsetMessage,
  RunQueueItem,
  RunQueueItemSend,
  RunQueueItemNotify,
  RunQueueItemGCAction,
  RunQueueItemBringOutYourDead,
  EndpointId,
  GCRunQueueType,
  CrankResults,
  EndpointHandle,
} from './types.ts';

// Define Message type for tests that matches the required structure
type Message = {
  methargs: { body: string; slots: string[] };
  result: string | null;
};

describe('KernelRouter', () => {
  // Mock dependencies
  let kernelStore: KernelStore;
  let kernelQueue: KernelQueue;
  let getEndpoint: (endpointId: EndpointId) => EndpointHandle;
  let endpointHandle: EndpointHandle;
  let kernelRouter: KernelRouter;

  beforeEach(() => {
    // Mock EndpointHandle with more detailed return values
    const mockCrankResults: CrankResults = { didDelivery: 'v1' };

    endpointHandle = {
      deliverMessage: vi.fn().mockResolvedValue(mockCrankResults),
      deliverNotify: vi.fn().mockResolvedValue(mockCrankResults),
      deliverDropExports: vi.fn().mockResolvedValue(mockCrankResults),
      deliverRetireExports: vi.fn().mockResolvedValue(mockCrankResults),
      deliverRetireImports: vi.fn().mockResolvedValue(mockCrankResults),
      deliverBringOutYourDead: vi.fn().mockResolvedValue(mockCrankResults),
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
        (_endpointId: string, message: SwingsetMessage) =>
          message as unknown as SwingsetMessage,
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
        const mockCrankResults: CrankResults = {
          didDelivery: endpointId,
          abort: false,
        };
        (
          endpointHandle.deliverMessage as unknown as MockInstance
        ).mockResolvedValueOnce(mockCrankResults);

        // Create a send message
        const message: Message = {
          methargs: { body: 'method args', slots: ['slot1', 'slot2'] },
          result: 'kp1',
        };
        const sendItem: RunQueueItemSend = {
          type: 'send',
          target,
          message: message as unknown as SwingsetMessage,
        };

        const result = await kernelRouter.deliver(sendItem);

        // Verify the message was delivered to the vat and results returned
        expect(getEndpoint).toHaveBeenCalledWith(endpointId);
        expect(endpointHandle.deliverMessage).toHaveBeenCalledWith(
          `translated-${target}`,
          message,
        );
        expect(result).toStrictEqual(mockCrankResults);
        expect(kernelStore.decrementRefCount).toHaveBeenCalledWith(
          'slot1',
          'deliver|send|slot',
        );
        expect(kernelStore.decrementRefCount).toHaveBeenCalledWith(
          'slot2',
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
        const message: Message = {
          methargs: { body: 'method args', slots: ['slot1', 'slot2'] },
          result: 'kp1',
        };
        const sendItem: RunQueueItemSend = {
          type: 'send',
          target,
          message: message as unknown as SwingsetMessage,
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
          'slot1',
          'deliver|splat|slot',
        );
        expect(kernelStore.decrementRefCount).toHaveBeenCalledWith(
          'slot2',
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
                body: expect.stringContaining('revoked object'),
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
        const message: Message = {
          methargs: { body: 'method args', slots: ['slot1', 'slot2'] },
          result: 'kp1',
        };
        const sendItem: RunQueueItemSend = {
          type: 'send',
          target,
          message: message as unknown as SwingsetMessage,
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
          'slot1',
          'deliver|splat|slot',
        );
        expect(kernelStore.decrementRefCount).toHaveBeenCalledWith(
          'slot2',
          'deliver|splat|slot',
        );
        expect(kernelStore.decrementRefCount).toHaveBeenCalledWith(
          'kp1',
          'deliver|splat|result',
        );
        // Verify the promise was rejected with 'no vat'
        expect(kernelQueue.resolvePromises).toHaveBeenCalledWith(
          undefined,
          expect.arrayContaining([
            expect.arrayContaining(['kp1', true, expect.anything()]),
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
        const message: Message = {
          methargs: { body: 'method args', slots: [] },
          result: null,
        };
        const sendItem: RunQueueItemSend = {
          type: 'send',
          target,
          message: message as unknown as SwingsetMessage,
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
        const message: Message = {
          methargs: { body: 'method args', slots: [] },
          result: 'kp2',
        };
        const sendItem: RunQueueItemSend = {
          type: 'send',
          target: promiseId,
          message: message as unknown as SwingsetMessage,
        };

        const result = await kernelRouter.deliver(sendItem);

        // Message should be splatted, not delivered
        expect(getEndpoint).not.toHaveBeenCalled();
        expect(endpointHandle.deliverMessage).not.toHaveBeenCalled();
        expect(result).toBeUndefined();

        // Verify the result promise was rejected
        expect(kernelQueue.resolvePromises).toHaveBeenCalledWith(
          undefined,
          expect.arrayContaining([
            expect.arrayContaining(['kp2', true, expect.anything()]),
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
        const message: Message = {
          methargs: { body: 'method args', slots: [] },
          result: 'kp2',
        };
        const sendItem: RunQueueItemSend = {
          type: 'send',
          target: promiseId,
          message: message as unknown as SwingsetMessage,
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
        const mockCrankResults: CrankResults = { didDelivery: endpointId };
        (
          endpointHandle.deliverNotify as unknown as MockInstance
        ).mockResolvedValueOnce(mockCrankResults);

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
        expect(result).toStrictEqual(mockCrankResults);
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
          const mockCrankResults: CrankResults = { didDelivery: endpointId };
          (
            endpointHandle[
              deliverMethod as keyof EndpointHandle
            ] as unknown as MockInstance
          ).mockResolvedValueOnce(mockCrankResults);

          // Deliver the GC action
          const result = await kernelRouter.deliver(gcAction);

          // Verify the action was delivered to the vat
          expect(getEndpoint).toHaveBeenCalledWith(endpointId);
          expect(
            endpointHandle[deliverMethod as keyof EndpointHandle],
          ).toHaveBeenCalledWith(krefs.map((kref) => `translated-${kref}`));
          expect(result).toStrictEqual(mockCrankResults);
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
        const mockCrankResults: CrankResults = { didDelivery: endpointId };
        (
          endpointHandle.deliverBringOutYourDead as unknown as MockInstance
        ).mockResolvedValueOnce(mockCrankResults);

        // Deliver the bringOutYourDead action
        const result = await kernelRouter.deliver(bringOutYourDeadItem);

        // Verify the action was delivered to the endpoint
        expect(getEndpoint).toHaveBeenCalledWith(endpointId);
        expect(endpointHandle.deliverBringOutYourDead).toHaveBeenCalled();
        expect(result).toStrictEqual(mockCrankResults);
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
