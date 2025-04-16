import type { VatOneResolution } from '@agoric/swingset-liveslots';
import type { CapData } from '@endo/marshal';
import { makePromiseKit } from '@endo/promise-kit';

import { processGCActionSet } from './services/garbage-collection.ts';
import type { KernelStore } from './store';
import { insistVatId } from './types.ts';
import type { KRef, RunQueueItem, RunQueueItemNotify, VatId } from './types.ts';
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

  /** Message results that the kernel itself has subscribed to */
  readonly subscriptions: Map<KRef, (value: CapData<KRef>) => void> = new Map();

  /** Thunk to signal run queue transition from empty to non-empty */
  #wakeUpTheRunQueue: (() => void) | null;

  constructor(kernelStore: KernelStore) {
    this.#kernelStore = kernelStore;
    this.#wakeUpTheRunQueue = null;
  }

  /**
   * The kernel's run loop: take an item off the run queue, deliver it,
   * repeat. Note that this loops forever: the returned promise never resolves.
   *
   * @param deliver - A function that delivers an item to the kernel.
   */
  async run(deliver: (item: RunQueueItem) => Promise<void>): Promise<void> {
    for await (const item of this.#runQueueItems()) {
      this.#kernelStore.nextTerminatedVatCleanup();
      await deliver(item);
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
    }
  }

  /**
   * Add an item to the tail of the kernel's run queue.
   *
   * @param item - The item to add.
   */
  enqueueRun(item: RunQueueItem): void {
    this.#kernelStore.enqueueRun(item);
    if (this.#kernelStore.runQueueLength() === 1 && this.#wakeUpTheRunQueue) {
      const wakeUpTheRunQueue = this.#wakeUpTheRunQueue;
      this.#wakeUpTheRunQueue = null;
      wakeUpTheRunQueue();
    }
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
    this.enqueueRun(notifyItem);
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
}
