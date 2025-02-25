import type { KVStore } from '@ocap/store';

import type { makeBaseStore } from './base-store.ts';
import type { RunQueueItem } from '../types.ts';

export type StoredQueue = {
  enqueue(item: object): void;
  dequeue(): object | undefined;
  delete(): void;
};

/**
 * Create a queue store object that provides functionality for managing queues.
 *
 * @param kv - The key-value store to use for persistent storage.
 * @param baseStore - The base store to use for the queue store.
 * @returns A queue store object that maps various persistent kernel data
 * structures onto `kv`.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function makeQueueStore(
  kv: KVStore,
  baseStore: ReturnType<typeof makeBaseStore>,
) {
  /** The kernel's run queue. */
  let runQueue = createStoredQueue('run', true);

  /**
   * Create a new (empty) persistently stored queue.
   *
   * @param queueName - The name for the queue (must be unique among queues).
   * @param cached - Optional flag: set to true if the queue should cache its
   * @returns An object for interacting with the new queue.
   */
  function createStoredQueue(
    queueName: string,
    cached: boolean = false,
  ): StoredQueue {
    const qk = `queue.${queueName}`;
    kv.set(`${qk}.head`, '1');
    kv.set(`${qk}.tail`, '1');
    return provideStoredQueue(queueName, cached);
  }

  /**
   * Produce an object to access a persistently stored queue.
   *
   * @param queueName - The name for the queue (must be unique among queues).
   * @param cached - Optional flag: set to true if the queue should cache its
   * limit indices in memory (only do this if the queue is going to be accessed or
   * checked frequently).
   * @returns An object for interacting with the queue.
   */
  function provideStoredQueue(
    queueName: string,
    cached: boolean = false,
  ): StoredQueue {
    const qk = `queue.${queueName}`;
    // Note: cached=true ==> caches only the head & tail indices, NOT the queue entries themselves
    const provideValue = cached
      ? baseStore.provideCachedStoredValue
      : baseStore.provideRawStoredValue;
    const head = provideValue(`${qk}.head`);
    const tail = provideValue(`${qk}.tail`);
    if (head.get() === undefined || tail.get() === undefined) {
      throw Error(`queue ${queueName} not initialized`);
    }
    return {
      enqueue(item: object): void {
        if (head.get() === undefined) {
          throw Error(`enqueue into deleted queue ${queueName}`);
        }
        const entryPos = baseStore.incCounter(head);
        kv.set(`${qk}.${entryPos}`, JSON.stringify(item));
      },
      dequeue(): object | undefined {
        const headPos = head.get();
        if (headPos === undefined) {
          return undefined;
        }
        const tailPos = tail.get();
        if (tailPos !== headPos) {
          const entry = kv.getRequired(`${qk}.${tailPos}`);
          kv.delete(`${qk}.${tailPos}`);
          baseStore.incCounter(tail);
          return JSON.parse(entry) as object;
        }
        return undefined;
      },
      delete(): void {
        const headPos = head.get();
        if (headPos !== undefined) {
          let tailPos = tail.get();
          while (tailPos !== headPos) {
            kv.delete(`${qk}.${tailPos}`);
            tailPos = `${Number(tailPos) + 1}`;
          }
          head.delete();
          tail.delete();
        }
      },
    };
  }

  /**
   * Append a message to the kernel's run queue.
   *
   * @param message - The message to enqueue.
   */
  function enqueueRun(message: RunQueueItem): void {
    runQueue.enqueue(message);
  }

  /**
   * Find out how long some queue is.
   *
   * @param queueName - The name of the queue of interest.
   *
   * @returns the number of items in the given queue.
   */
  function getQueueLength(queueName: string): number {
    const qk = `queue.${queueName}`;
    const head = kv.get(`${qk}.head`);
    const tail = kv.get(`${qk}.tail`);
    if (head === undefined || tail === undefined) {
      throw Error(`unknown queue ${queueName}`);
    }
    return Number(head) - Number(tail);
  }

  /**
   * Fetch the next message on the kernel's run queue.
   *
   * @returns The next message on the run queue, or undefined if the queue is
   * empty.
   */
  function dequeueRun(): RunQueueItem | undefined {
    return runQueue.dequeue() as RunQueueItem | undefined;
  }

  /**
   * Obtain the number of entries in the run queue.
   *
   * @returns the number of items in the run queue.
   */
  function runQueueLength(): number {
    return getQueueLength('run');
  }

  /**
   *
   */
  function reset(): void {
    runQueue = createStoredQueue('run', true);
  }

  return {
    // Queue
    createStoredQueue,
    provideStoredQueue,
    getQueueLength,

    // Run queue operations
    enqueueRun,
    dequeueRun,
    runQueueLength,

    // Reset
    reset,
  };
}
