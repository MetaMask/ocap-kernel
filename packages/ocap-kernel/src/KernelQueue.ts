import type { VatOneResolution } from '@agoric/swingset-liveslots';
import type { CapData } from '@endo/marshal';
import { makePromiseKit } from '@endo/promise-kit';

import { processGCActionSet } from './garbage-collection/garbage-collection.ts';
import { kser } from './liveslots/kernel-marshal.ts';
import type { KernelStore } from './store/index.ts';
import { insistEndpointId } from './types.ts';
import type {
  CrankResults,
  KRef,
  Message,
  RunQueueItem,
  RunQueueItemNotify,
  RunQueueItemSend,
  VatId,
  EndpointId,
} from './types.ts';
import { Fail } from './utils/assert.ts';

/**
 * The kernel's run queue.
 *
 * This class manages the kernel's run queue, which is a queue of items that
 * need to be processed.
 */
export class KernelQueue {
  /** Storage holding the kernel's own persistent state */
  readonly #kernelStore: KernelStore;

  /** A function that terminates a vat. */
  readonly #terminateVat: (
    vatId: VatId,
    reason?: CapData<KRef>,
  ) => Promise<void>;

  /** Message results that the kernel itself has subscribed to */
  readonly subscriptions: Map<KRef, (value: CapData<KRef>) => void> = new Map();

  /** Thunk to signal run queue transition from empty to non-empty */
  #wakeUpTheRunQueue: (() => void) | null;

  /**
   * Construct a new KernelQueue instance.
   *
   * @param kernelStore - The kernel's persistent state store.
   * @param terminateVat - Function to terminate a vat with an optional reason.
   */
  constructor(
    kernelStore: KernelStore,
    terminateVat: (vatId: VatId, reason?: CapData<KRef>) => Promise<void>,
  ) {
    this.#kernelStore = kernelStore;
    this.#terminateVat = terminateVat;
    this.#wakeUpTheRunQueue = null;
  }

  /**
   * The kernel's run loop: take an item off the run queue, deliver it,
   * repeat. Note that this loops forever: the returned promise never resolves.
   *
   * @param deliver - A function that delivers an item to the kernel.
   */
  async run(
    deliver: (item: RunQueueItem) => Promise<CrankResults | undefined>,
  ): Promise<void> {
    for await (const item of this.#runQueueItems()) {
      this.#kernelStore.nextTerminatedVatCleanup();
      const crankResults = await deliver(item);
      if (crankResults?.abort) {
        // Rollback the kernel state to before the failed delivery attempt.
        // For active vats, this allows the message to be retried in a future crank.
        // For terminated vats, the message will just go splat.
        this.#kernelStore.rollbackCrank('start');
        // TODO: Currently all errors terminate the vat, but instead we could
        // restart it and terminate the vat only after a certain number of failed
        // retries. This is probably where we should implement the vat restart logic.
      } else {
        // Upon on successful crank completion, enqueue buffered vat outputs for delivery.
        this.#flushCrankBuffer();
      }
      // Vat termination during delivery is triggered by an illegal syscall
      // or by syscall.exit().
      if (crankResults?.terminate) {
        const { vatId, info } = crankResults.terminate;
        await this.#terminateVat(vatId, info);
      }
      this.#kernelStore.collectGarbage();
    }
  }

  /**
   * Async generator that yields the items from the kernel run queue, in order.
   *
   * @yields the next item in the run queue.
   */
  async *#runQueueItems(): AsyncGenerator<RunQueueItem> {
    for (;;) {
      this.#kernelStore.startCrank();
      let wakeUpPromise: Promise<void> | undefined;
      try {
        this.#kernelStore.createCrankSavepoint('start');
        const gcAction = processGCActionSet(this.#kernelStore);
        if (gcAction) {
          yield gcAction;
          continue;
        }

        const reapAction = this.#kernelStore.nextReapAction();
        if (reapAction) {
          yield reapAction;
          continue;
        }

        while (this.#kernelStore.runQueueLength() > 0) {
          const item = this.#kernelStore.dequeueRun();
          if (item) {
            yield item;
          } else {
            break;
          }
        }

        if (this.#kernelStore.runQueueLength() === 0) {
          const { promise, resolve } = makePromiseKit<void>();
          if (this.#wakeUpTheRunQueue !== null) {
            Fail`wakeUpTheRunQueue function already set`;
          }
          this.#wakeUpTheRunQueue = resolve;
          wakeUpPromise = promise;
        }
      } finally {
        this.#kernelStore.endCrank();
        if (wakeUpPromise) {
          await wakeUpPromise;
        }
      }
    }
  }

  /**
   * Add an item to the tail of the kernel's run queue.
   *
   * @param item - The item to add.
   */
  #enqueueRun(item: RunQueueItem): void {
    this.#kernelStore.enqueueRun(item);
    if (this.#kernelStore.runQueueLength() === 1 && this.#wakeUpTheRunQueue) {
      const wakeUpTheRunQueue = this.#wakeUpTheRunQueue;
      this.#wakeUpTheRunQueue = null;
      wakeUpTheRunQueue();
    }
  }

  /**
   * Flush the crank buffer, moving buffered vat output items to the run queue
   * and invoking kernel subscription callbacks for resolved promises.
   */
  #flushCrankBuffer(): void {
    const items = this.#kernelStore.flushCrankBuffer();
    for (const item of items) {
      this.#enqueueRun(item);
      if (item.type === 'notify') {
        // Invoke kernel subscription callback if any, reading resolution
        // data from the (now committed) promise state
        this.#invokeKernelSubscription(item.kpid);
      }
    }
  }

  /**
   * Invoke the kernel subscription callback for a resolved promise, if any.
   *
   * @param kpid - The promise ID to check for subscriptions.
   */
  #invokeKernelSubscription(kpid: KRef): void {
    const subscription = this.subscriptions.get(kpid);
    if (subscription) {
      this.subscriptions.delete(kpid);
      const promise = this.#kernelStore.getKernelPromise(kpid);
      subscription(promise.value as CapData<KRef>);
    }
  }

  /**
   * Queue a message to be delivered from the kernel to an object in an endpoint.
   *
   * @param target - The object to which the message is directed.
   * @param method - The method to be invoked.
   * @param args - Message arguments.
   *
   * @returns a promise for the (CapData encoded) result of the message invocation.
   */
  async enqueueMessage(
    target: KRef,
    method: string,
    args: unknown[],
  ): Promise<CapData<KRef>> {
    // TODO(#562): Use logger instead.
    // eslint-disable-next-line no-console
    console.debug('enqueueMessage', target, method, args);
    const result = this.#kernelStore.initKernelPromise()[0];
    const { promise, resolve } = makePromiseKit<CapData<KRef>>();
    this.subscriptions.set(result, resolve);
    this.enqueueSend(target, {
      methargs: kser([method, args]),
      result,
    });
    return promise;
  }

  /**
   * Enqueue a message send to be delivered to an endpoint.
   *
   * @param target - The object to which the message is directed.
   * @param message - The message to be delivered.
   * @param buffer - If true, buffer for crank completion instead of immediate enqueue.
   */
  enqueueSend(target: KRef, message: Message, buffer = false): void {
    this.#kernelStore.incrementRefCount(target, 'queue|target');
    if (message.result) {
      this.#kernelStore.incrementRefCount(message.result, 'queue|result');
    }
    for (const slot of message.methargs.slots || []) {
      this.#kernelStore.incrementRefCount(slot, 'queue|slot');
    }
    const item: RunQueueItemSend = { type: 'send', target, message };
    if (buffer) {
      this.#kernelStore.bufferCrankOutput(item);
    } else {
      this.#enqueueRun(item);
    }
  }

  /**
   * Enqueue a notification of promise resolution to an endpoint.
   *
   * @param endpointId - The endpoint that will be notified.
   * @param kpid - The promise of interest.
   * @param buffer - If true, buffer for crank completion instead of immediate enqueue.
   */
  enqueueNotify(endpointId: EndpointId, kpid: KRef, buffer = false): void {
    this.#kernelStore.incrementRefCount(kpid, 'notify');
    const item: RunQueueItemNotify = { type: 'notify', endpointId, kpid };
    if (buffer) {
      this.#kernelStore.bufferCrankOutput(item);
    } else {
      this.#enqueueRun(item);
    }
  }

  /**
   * Wait for the current crank to complete.
   * This method can be called by external operations to ensure they don't interfere
   * with ongoing kernel operations.
   *
   * @returns A promise that resolves when the current crank is complete.
   */
  async waitForCrank(): Promise<void> {
    return this.#kernelStore.waitForCrank();
  }

  /**
   * Process a set of promise resolutions coming from an endpoint.
   * Notifications are buffered and kernel subscription callbacks are deferred
   * until the crank buffer is flushed on successful crank completion.
   *
   * @param endpointId - The endpoint doing the resolving, if there is one.
   * @param resolutions - One or more resolutions, to be processed as a group.
   */
  resolvePromises(
    endpointId: EndpointId | undefined,
    resolutions: VatOneResolution[],
  ): void {
    if (endpointId && endpointId !== 'kernel') {
      insistEndpointId(endpointId);
    }
    for (const resolution of resolutions) {
      const [kpid, rejected, dataRaw] = resolution;
      const data = dataRaw as CapData<KRef>;

      this.#kernelStore.incrementRefCount(kpid, 'resolve|kpid');
      for (const slot of data.slots || []) {
        this.#kernelStore.incrementRefCount(slot, 'resolve|slot');
      }

      const promise = this.#kernelStore.getKernelPromise(kpid);
      const { state, decider, subscribers } = promise;
      if (state !== 'unresolved') {
        Fail`${kpid} was already resolved`;
      }
      if (decider !== endpointId) {
        const why = decider ? `its decider is ${decider}` : `it has no decider`;
        Fail`${endpointId} not permitted to resolve ${kpid} because ${why}`;
      }
      if (!subscribers) {
        throw Fail`${kpid} subscribers not set`;
      }

      // Buffer notifications for each subscriber.
      for (const subscriber of subscribers) {
        this.enqueueNotify(subscriber, kpid, true);
      }

      // Update promise state and get any queued messages to it.
      const queuedMessages = this.#kernelStore.resolveKernelPromise(
        kpid,
        rejected,
        data,
      );

      // Buffer the queued messages.
      for (const [target, message] of queuedMessages) {
        this.enqueueSend(target, message, true);
      }

      // Kernel subscription callback will be invoked during crank buffer flush
    }
  }
}
