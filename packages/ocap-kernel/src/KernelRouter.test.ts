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
  VatId,
  GCRunQueueType,
} from './types.ts';
import type { VatHandle } from './VatHandle.ts';

// Define Message type for tests that matches the required structure
type Message = {
  methargs: { body: string; slots: string[] };
  result: string | null;
};

describe('KernelRouter', () => {
  // Mock dependencies
  let kernelStore: KernelStore;
  let kernelQueue: KernelQueue;
  let getVat: (vatId: VatId) => VatHandle;
  let vatHandle: VatHandle;
  let kernelRouter: KernelRouter;

  beforeEach(() => {
    // Mock VatHandle
    vatHandle = {
      deliverMessage: vi.fn().mockResolvedValue(undefined),
      deliverNotify: vi.fn().mockResolvedValue(undefined),
      deliverDropExports: vi.fn().mockResolvedValue(undefined),
      deliverRetireExports: vi.fn().mockResolvedValue(undefined),
      deliverRetireImports: vi.fn().mockResolvedValue(undefined),
      deliverBringOutYourDead: vi.fn().mockResolvedValue(undefined),
    } as unknown as VatHandle;

    // Mock getVat function
    getVat = vi.fn().mockReturnValue(vatHandle);

    // Mock KernelStore
    kernelStore = {
      getOwner: vi.fn(),
      getKernelPromise: vi.fn(),
      decrementRefCount: vi.fn(),
      setPromiseDecider: vi.fn(),
      translateRefKtoV: vi.fn(
        (_vatId: string, kref: string) => `translated-${kref}`,
      ) as unknown as MockInstance,
      translateMessageKtoV: vi.fn(
        (_vatId: string, message: SwingsetMessage) =>
          message as unknown as SwingsetMessage,
      ) as unknown as MockInstance,
      enqueuePromiseMessage: vi.fn(),
      erefToKref: vi.fn() as unknown as MockInstance,
      krefToEref: vi.fn() as unknown as MockInstance,
      getKpidsToRetire: vi.fn().mockReturnValue([]),
      translateCapDataKtoV: vi.fn(),
      krefsToExistingErefs: vi.fn((_vatId: string, krefs: string[]) =>
        krefs.map((kref: string) => `translated-${kref}`),
      ) as unknown as MockInstance,
    } as unknown as KernelStore;

    // Mock KernelQueue
    kernelQueue = {
      resolvePromises: vi.fn(),
    } as unknown as KernelQueue;

    // Create the router to test
    kernelRouter = new KernelRouter(kernelStore, kernelQueue, getVat);
  });

  describe('deliver', () => {
    describe('send', () => {
      it('delivers a send message to a vat with an object target', async () => {
        // Setup the kernel store to return an owner for the target
        const vatId = 'v1';
        const target = 'ko123';
        (kernelStore.getOwner as unknown as MockInstance).mockReturnValueOnce(
          vatId,
        );
        (kernelStore.erefToKref as unknown as MockInstance).mockReturnValueOnce(
          'not-the-target',
        );
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
        await kernelRouter.deliver(sendItem);
        // Verify the message was delivered to the vat
        expect(getVat).toHaveBeenCalledWith(vatId);
        expect(vatHandle.deliverMessage).toHaveBeenCalledWith(
          `translated-${target}`,
          message,
        );
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

      it('splats a message when target has no owner', async () => {
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
        await kernelRouter.deliver(sendItem);
        // Verify the message was not delivered to any vat and resources were cleaned up
        expect(getVat).not.toHaveBeenCalled();
        expect(vatHandle.deliverMessage).not.toHaveBeenCalled();
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

      it('enqueues a message on an unresolved promise', async () => {
        // Setup a promise reference and unresolved promise in the kernel store
        const target = 'kp123';
        (
          kernelStore.getKernelPromise as unknown as MockInstance
        ).mockReturnValueOnce({
          state: 'unresolved',
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
        await kernelRouter.deliver(sendItem);
        // Verify the message was enqueued on the promise
        expect(kernelStore.enqueuePromiseMessage).toHaveBeenCalledWith(
          target,
          message,
        );
        expect(getVat).not.toHaveBeenCalled();
        expect(vatHandle.deliverMessage).not.toHaveBeenCalled();
      });
    });

    describe('notify', () => {
      it('delivers a notify to a vat', async () => {
        const vatId = 'v1';
        const kpid = 'kp123';
        const notifyItem: RunQueueItemNotify = {
          type: 'notify',
          vatId,
          kpid,
        };
        // Mock a resolved promise
        (
          kernelStore.getKernelPromise as unknown as MockInstance
        ).mockReturnValueOnce({
          state: 'fulfilled',
          value: { body: 'resolved value', slots: [] },
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
          value: { body: 'target promise value', slots: [] },
        });
        // Deliver the notify
        await kernelRouter.deliver(notifyItem);
        // Verify the notification was delivered to the vat
        expect(getVat).toHaveBeenCalledWith(vatId);
        expect(vatHandle.deliverNotify).toHaveBeenCalledWith(expect.any(Array));
        expect(kernelStore.decrementRefCount).toHaveBeenCalledWith(
          kpid,
          'deliver|notify',
        );
      });

      it('does nothing if the promise is not in vat clist', async () => {
        const vatId = 'v1';
        const kpid = 'kp123';
        const notifyItem: RunQueueItemNotify = {
          type: 'notify',
          vatId,
          kpid,
        };
        // Mock a resolved promise
        (
          kernelStore.getKernelPromise as unknown as MockInstance
        ).mockReturnValueOnce({
          state: 'fulfilled',
          value: { body: 'resolved value', slots: [] },
        });
        // Mock that this promise is NOT in the vat's clist
        (kernelStore.krefToEref as unknown as MockInstance).mockReturnValueOnce(
          null,
        );
        // Deliver the notify
        await kernelRouter.deliver(notifyItem);
        // Verify no notification was delivered to the vat
        expect(vatHandle.deliverNotify).not.toHaveBeenCalled();
      });
    });

    describe('gc actions', () => {
      it.each([
        ['dropExports', 'deliverDropExports'],
        ['retireExports', 'deliverRetireExports'],
        ['retireImports', 'deliverRetireImports'],
      ])('delivers %s to a vat', async (actionType, deliverMethod) => {
        const vatId = 'v1';
        const krefs = ['ko1', 'ko2'];
        const gcAction: RunQueueItemGCAction = {
          type: actionType as GCRunQueueType,
          vatId,
          krefs,
        };
        // Deliver the GC action
        await kernelRouter.deliver(gcAction);
        // Verify the action was delivered to the vat
        expect(getVat).toHaveBeenCalledWith(vatId);
        expect(
          vatHandle[deliverMethod as keyof VatHandle],
        ).toHaveBeenCalledWith(krefs.map((kref) => `translated-${kref}`));
      });
    });

    describe('bringOutYourDead', () => {
      it('delivers bringOutYourDead to a vat', async () => {
        const vatId = 'v1';
        const bringOutYourDeadItem: RunQueueItemBringOutYourDead = {
          type: 'bringOutYourDead',
          vatId,
        };
        // Deliver the bringOutYourDead action
        await kernelRouter.deliver(bringOutYourDeadItem);
        // Verify the action was delivered to the vat
        expect(getVat).toHaveBeenCalledWith(vatId);
        expect(vatHandle.deliverBringOutYourDead).toHaveBeenCalled();
      });
    });

    it('throws on unknown run queue item type', async () => {
      // @ts-expect-error - deliberately using an invalid type
      const invalidItem: RunQueueItem = { type: 'invalid' };
      await expect(kernelRouter.deliver(invalidItem)).rejects.toThrow(
        'unknown run queue item type',
      );
    });
  });
});
