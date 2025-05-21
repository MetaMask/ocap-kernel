import type { VatOneResolution } from '@agoric/swingset-liveslots';
import type { CapData } from '@endo/marshal';
import { makePromiseKit } from '@endo/promise-kit';

import { processGCActionSet } from './services/garbage-collection.ts';
import { kser, makeError } from './services/kernel-marshal.ts';
import type { KernelStore } from './store/index.ts';
import { insistVatId } from './types.ts';
import type {
  CrankResults,
  KRef,
  Message,
  RunQueueItem,
  RunQueueItemNotify,
  RunQueueItemSend,
  VatId,
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

      // Check if the target vat is compromised before attempting delivery
      const targetVatId = this.#kernelStore.getRunQueueItemTargetVatId(item);
      if (targetVatId && this.#kernelStore.isVatCompromised(targetVatId)) {
        await this.#terminateCompromisedVat(item, targetVatId);
        this.#kernelStore.collectGarbage();
        continue;
      }

      this.#kernelStore.createCrankSavepoint('deliver');
      const crankResults = await deliver(item);
      if (crankResults?.abort) {
        // - consumeMessage=true (for hypothetical one-shot lifecycle ops):
        //   rolls back to 'deliver', discarding the message.
        // - consumeMessage=false (default for sends/notifies):
        //   rolls back to 'start', re-queuing the message (e.g., to "splat" against a now-terminated vat, rejecting its result to the sender).
        // Currently, consumeMessage defaults to false as such lifecycle ops are not distinct run-queue item types here.
        this.#kernelStore.rollbackCrank(
          crankResults.consumeMessage ? 'deliver' : 'start',
        );
      }
      // Vat termination during delivery is triggered by an illegal syscall or by syscall.exit()
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
          await promise;
        }
      } finally {
        this.#kernelStore.endCrank();
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
   * Queue a message to be delivered from the kernel to an object in a vat.
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
   * Enqueue a send message to be delivered to a vat.
   *
   * @param target - The object to which the message is directed.
   * @param message - The message to be delivered.
   */
  enqueueSend(target: KRef, message: Message): void {
    this.#kernelStore.incrementRefCount(target, 'queue|target');
    if (message.result) {
      this.#kernelStore.incrementRefCount(message.result, 'queue|result');
    }
    for (const slot of message.methargs.slots || []) {
      this.#kernelStore.incrementRefCount(slot, 'queue|slot');
    }
    const queueItem: RunQueueItemSend = {
      type: 'send',
      target,
      message,
    };
    this.#enqueueRun(queueItem);
  }

  /**
   * Enqueue for delivery a notification to a vat about the resolution of a
   * promise.
   *
   * @param vatId - The vat that will be notified.
   * @param kpid - The promise of interest.
   */
  enqueueNotify(vatId: VatId, kpid: KRef): void {
    const notifyItem: RunQueueItemNotify = { type: 'notify', vatId, kpid };
    this.#enqueueRun(notifyItem);
    // Increment reference count for the promise being notified about
    this.#kernelStore.incrementRefCount(kpid, 'notify');
  }

  /**
   * Process a set of promise resolutions coming from a vat.
   *
   * @param vatId - The vat doing the resolving, if there is one.
   * @param resolutions - One or more resolutions, to be processed as a group.
   */
  resolvePromises(
    vatId: VatId | undefined,
    resolutions: VatOneResolution[],
  ): void {
    if (vatId) {
      insistVatId(vatId);
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
      if (decider !== vatId) {
        const why = decider ? `its decider is ${decider}` : `it has no decider`;
        Fail`${vatId} not permitted to resolve ${kpid} because ${why}`;
      }
      if (!subscribers) {
        throw Fail`${kpid} subscribers not set`;
      }
      for (const subscriber of subscribers) {
        this.enqueueNotify(subscriber, kpid);
      }
      this.#kernelStore.resolveKernelPromise(kpid, rejected, data);
      const kernelResolve = this.subscriptions.get(kpid);
      if (kernelResolve) {
        this.subscriptions.delete(kpid);
        kernelResolve(data);
      }
    }
  }

  /**
   * Terminate a compromised vat and reject any pending promises.
   *
   * @param item - The run queue item that triggered the termination.
   * @param vatId - The ID of the compromised vat.
   */
  async #terminateCompromisedVat(
    item: RunQueueItem,
    vatId: VatId,
  ): Promise<void> {
    // Ensure the vat is fully terminated if not already done
    await this.#terminateVat(
      vatId,
      makeError(`Vat ${vatId} terminated due to prior syscall error.`),
    );

    // If the item was a 'send' with a result promise, reject that promise
    if (item.type === 'send' && item.message.result) {
      this.resolvePromises(undefined, [
        [
          item.message.result,
          true, // rejected
          makeError(`Vat ${vatId} terminated.`),
        ],
      ]);
    }
  }
}
