import type { RunQueueItem, VatId } from '../../types.ts';
import type { StoreContext } from '../types.ts';
import { getObjectMethods } from './object.ts';
/**
 * Get a queue store object that provides functionality for managing queues.
 *
 * @param ctx - The store context.
 * @returns A queue store object that maps various persistent kernel data
 * structures onto `kv`.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function getQueueMethods(ctx: StoreContext) {
  const { getOwner } = getObjectMethods(ctx);

  /**
   * Find out how long some queue is.
   *
   * @param queueName - The name of the queue of interest.
   *
   * @returns the number of items in the given queue.
   */
  function getQueueLength(queueName: string): number {
    const qk = `queue.${queueName}`;
    const head = ctx.kv.get(`${qk}.head`);
    const tail = ctx.kv.get(`${qk}.tail`);
    if (head === undefined || tail === undefined) {
      throw Error(`unknown queue ${queueName}`);
    }
    return Number(head) - Number(tail);
  }

  /**
   * Append a message to the kernel's run queue.
   *
   * @param message - The message to enqueue.
   */
  function enqueueRun(message: RunQueueItem): void {
    ctx.runQueueLengthCache += 1;
    ctx.runQueue.enqueue(message);
  }

  /**
   * Fetch the next message on the kernel's run queue.
   *
   * @returns The next message on the run queue, or undefined if the queue is
   * empty.
   */
  function dequeueRun(): RunQueueItem | undefined {
    ctx.runQueueLengthCache -= 1;
    return ctx.runQueue.dequeue() as RunQueueItem | undefined;
  }

  /**
   * Obtain the number of entries in the run queue.
   *
   * @returns the number of items in the run queue.
   */
  function runQueueLength(): number {
    if (ctx.runQueueLengthCache < 0) {
      ctx.runQueueLengthCache = getQueueLength('run');
    }
    return ctx.runQueueLengthCache;
  }

  /**
   * Get the target VatId from a RunQueueItem.
   *
   * @param item - The RunQueueItem to get the target VatId from.
   * @returns The target VatId, or undefined if the item is not a send.
   */
  function getRunQueueItemTargetVatId(item: RunQueueItem): VatId | undefined {
    switch (item.type) {
      case 'send': {
        return getOwner(item.target);
      }
      case 'notify':
      case 'dropExports':
      case 'retireExports':
      case 'retireImports':
      case 'bringOutYourDead': {
        return item.vatId;
      }
      default:
        return undefined;
    }
  }

  return {
    getQueueLength,
    enqueueRun,
    dequeueRun,
    runQueueLength,
    getRunQueueItemTargetVatId,
  };
}
