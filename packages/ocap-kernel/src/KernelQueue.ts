import type { VatOneResolution } from '@agoric/swingset-liveslots';
import type { CapData } from '@endo/marshal';
import { makePromiseKit } from '@endo/promise-kit';

import { processGCActionSet } from './garbage-collection/garbage-collection.ts';
import { kser } from './liveslots/kernel-marshal.ts';
import type { KernelStore } from './store/index.ts';
import { insistEndpointId } from './types.ts';
import type {
  CrankResult,
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
  readonly subscriptions: Map<
    KRef,
    {
      resolve: (value: CapData<KRef>) => void;
      reject: (reason: unknown) => void;
    }
  > = new Map();

  /** Promises resolved during this crank that have kernel subscriptions */
  #resolvedWithKernelSubscription: KRef[] = [];

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
    deliver: (item: RunQueueItem) => Promise<CrankResult | undefined>,
  ): Promise<never> {
    for (;;) {
      let wakeUpPromise: Promise<void> | undefined;

      this.#kernelStore.startCrank();
      try {
        this.#kernelStore.createCrankSavepoint('start');

        const queueItem = this.#getNextRunQueueItem();
        if (queueItem === undefined) {
          // Queue empty — sleep until woken
          const { promise, resolve } = makePromiseKit<void>();
          if (this.#wakeUpTheRunQueue !== null) {
            Fail`run queue already waiting to be woken; cannot sleep again before the previous wake handler is consumed`;
          }

          this.#wakeUpTheRunQueue = resolve;
          wakeUpPromise = promise;
        } else {
          this.#kernelStore.nextTerminatedVatCleanup();
          const crankResult = await deliver(queueItem);
          await this.#processCrankResult(crankResult, queueItem);
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
   * Get the next item from the kernel run queue.
   * **ATTN:** Mutates the kernel store if the queue is not empty.
   *
   * @returns The next item in the run queue, or undefined if the queue is empty.
   */
  #getNextRunQueueItem(): RunQueueItem | undefined {
    const gcAction = processGCActionSet(this.#kernelStore);
    if (gcAction) {
      return gcAction;
    }

    const reapAction = this.#kernelStore.nextReapAction();
    if (reapAction) {
      return reapAction;
    }

    if (this.#kernelStore.runQueueLength() > 0) {
      const item = this.#kernelStore.dequeueRun();
      if (item) {
        return item;
      }
    }
    return undefined;
  }

  /**
   * Process the results of a crank.
   *
   * @param crankResult - The crank results.
   * @param queueItem - The run qeueue item that caused the crank results.
   */
  async #processCrankResult(
    crankResult: CrankResult | undefined,
    queueItem: RunQueueItem,
  ): Promise<void> {
    if (crankResult?.abort) {
      // Rollback the kernel state to before the failed delivery attempt.
      // For active vats, this allows the message to be retried in a future crank.
      // For terminated vats, the message will just go splat.
      this.#kernelStore.rollbackCrank('start');
      // Discard kernel subscriptions that were queued for invocation
      this.#resolvedWithKernelSubscription = [];

      // If the vat is being terminated, reject the JS subscription for this
      // message's result promise immediately. The rollback undid the delivery,
      // and the vat won't be around to handle a retry.
      if (
        crankResult.terminate &&
        queueItem.type === 'send' &&
        queueItem.message.result
      ) {
        const subscription = this.subscriptions.get(queueItem.message.result);
        if (subscription) {
          this.subscriptions.delete(queueItem.message.result);
          subscription.reject(crankResult.terminate.info);
        }
      }
      // TODO: Currently all errors terminate the vat, but instead we could
      // restart it and terminate the vat only after a certain number of failed
      // retries. This is probably where we should implement the vat restart logic.
    } else {
      // Upon on successful crank completion, enqueue buffered vat outputs for delivery.
      this.#flushCrankBuffer();
    }
    // Vat termination during delivery is triggered by an illegal syscall
    // or by syscall.exit().
    if (crankResult?.terminate) {
      const { vatId, info } = crankResult.terminate;
      await this.#terminateVat(vatId, info);
    }
    this.#kernelStore.collectGarbage();
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

    // Invoke kernel subscriptions for promises resolved during this crank
    // that don't have kernel-level subscribers (e.g., promises from enqueueMessage)
    for (const kpid of this.#resolvedWithKernelSubscription) {
      this.#invokeKernelSubscription(kpid);
    }
    this.#resolvedWithKernelSubscription = [];
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
      if (promise.state === 'rejected') {
        subscription.reject(promise.value);
      } else {
        subscription.resolve(promise.value as CapData<KRef>);
      }
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
    const { promise, resolve, reject } = makePromiseKit<CapData<KRef>>();
    this.subscriptions.set(result, { resolve, reject });
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
   * @param immediate - If true (the default), enqueue immediately; if false, buffer for crank completion.
   */
  enqueueSend(target: KRef, message: Message, immediate = true): void {
    this.#kernelStore.incrementRefCount(target, 'queue|target');
    if (message.result) {
      this.#kernelStore.incrementRefCount(message.result, 'queue|result');
    }
    for (const slot of message.methargs.slots || []) {
      this.#kernelStore.incrementRefCount(slot, 'queue|slot');
    }
    const item: RunQueueItemSend = { type: 'send', target, message };
    if (immediate) {
      this.#enqueueRun(item);
    } else {
      this.#kernelStore.bufferCrankOutput(item);
    }
  }

  /**
   * Enqueue a notification of promise resolution to an endpoint.
   *
   * @param endpointId - The endpoint that will be notified.
   * @param kpid - The promise of interest.
   * @param immediate - If true (the default), enqueue immediately; if false, buffer for crank completion.
   */
  enqueueNotify(endpointId: EndpointId, kpid: KRef, immediate = true): void {
    this.#kernelStore.incrementRefCount(kpid, 'notify');
    const item: RunQueueItemNotify = { type: 'notify', endpointId, kpid };
    if (immediate) {
      this.#enqueueRun(item);
    } else {
      this.#kernelStore.bufferCrankOutput(item);
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
   * When immediate is false (for vat syscalls), notifications and kernel
   * subscription callbacks are deferred until the crank buffer is flushed on
   * successful crank completion. When immediate is true (for remote message
   * handling), effects are immediate.
   *
   * @param endpointId - The endpoint doing the resolving, if there is one.
   * @param resolutions - One or more resolutions, to be processed as a group.
   * @param immediate - If true (the default), enqueue immediately; if false, buffer for crank completion.
   */
  resolvePromises(
    endpointId: EndpointId | undefined,
    resolutions: VatOneResolution[],
    immediate = true,
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

      // Enqueue notifications for each subscriber (immediate or buffered based on flag).
      for (const subscriber of subscribers) {
        this.enqueueNotify(subscriber, kpid, immediate);
      }

      // Update promise state and get any queued messages to it.
      const queuedMessages = this.#kernelStore.resolveKernelPromise(
        kpid,
        rejected,
        data,
      );

      // Enqueue the queued messages (immediate or buffered based on flag).
      for (const [target, message] of queuedMessages) {
        this.enqueueSend(target, message, immediate);
      }

      // Handle kernel subscriptions based on immediate flag.
      if (immediate) {
        // Invoke kernel subscription immediately
        this.#invokeKernelSubscription(kpid);
      } else if (this.subscriptions.has(kpid)) {
        // Track resolved promises that have kernel subscriptions for invocation at flush time
        this.#resolvedWithKernelSubscription.push(kpid);
      }
    }
  }
}
