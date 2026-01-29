import type { RunQueueItemNotify, RunQueueItemSend } from '../types.ts';

export type BufferedItem = RunQueueItemSend | RunQueueItemNotify;

/**
 * A buffer for holding vat outputs during crank execution.
 *
 * Sends and notifications are buffered here during a crank and then flushed
 * to the run queue on successful crank completion. On rollback, the buffer
 * is cleared without flushing.
 */
export class CrankBuffer {
  #items: BufferedItem[] = [];

  /**
   * Buffer a send item.
   *
   * @param item - The send item to buffer.
   */
  bufferSend(item: RunQueueItemSend): void {
    this.#items.push(item);
  }

  /**
   * Buffer a notify item.
   *
   * @param item - The notify item to buffer.
   */
  bufferNotify(item: RunQueueItemNotify): void {
    this.#items.push(item);
  }

  /**
   * Flush the buffer, returning all items and clearing the buffer.
   *
   * @returns The buffered items.
   */
  flush(): BufferedItem[] {
    const items = this.#items;
    this.#items = [];
    return items;
  }

  /**
   * Clear the buffer without returning items.
   */
  clear(): void {
    this.#items = [];
  }

  /**
   * Get the number of items in the buffer.
   *
   * @returns The number of items in the buffer.
   */
  get length(): number {
    return this.#items.length;
  }
}
