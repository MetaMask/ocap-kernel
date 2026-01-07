import type { PendingMessage } from './PeerConnectionState.ts';

/**
 * Queue for managing pending messages awaiting acknowledgment.
 * Implements FIFO queue semantics with capacity limits.
 */
export class MessageQueue {
  readonly #queue: PendingMessage[] = [];

  readonly #maxCapacity: number;

  /**
   * Constructor for the MessageQueue.
   *
   * @param maxCapacity - The maximum capacity of the queue.
   */
  constructor(maxCapacity = 200) {
    this.#maxCapacity = maxCapacity;
  }

  /**
   * Add a pending message to the back of the queue.
   * If at capacity, rejects the new message and does not add it.
   *
   * @param pending - The pending message to add to the queue.
   * @returns True if the message was added, false if rejected due to capacity.
   */
  enqueue(pending: PendingMessage): boolean {
    if (this.#queue.length >= this.#maxCapacity) {
      // Reject the new message - don't drop messages already awaiting ACK
      pending.reject(Error('Message rejected: queue at capacity'));
      return false;
    }
    this.#queue.push(pending);
    return true;
  }

  /**
   * Remove and return the first pending message from the queue.
   *
   * @returns The first pending message, or undefined if the queue is empty.
   */
  dequeue(): PendingMessage | undefined {
    return this.#queue.shift();
  }

  /**
   * Get the first pending message without removing it.
   *
   * @returns The first pending message, or undefined if the queue is empty.
   */
  peekFirst(): PendingMessage | undefined {
    return this.#queue[0];
  }

  /**
   * Clear all pending messages from the queue without rejecting them.
   * Caller is responsible for handling promise resolution/rejection.
   */
  clear(): void {
    this.#queue.length = 0;
  }

  /**
   * Get the current queue length.
   *
   * @returns The current queue length.
   */
  get length(): number {
    return this.#queue.length;
  }

  /**
   * Get a read-only view of the pending messages.
   * Useful for iteration (reject all, flush all, etc.).
   *
   * @returns A read-only view of the pending messages.
   */
  get messages(): readonly PendingMessage[] {
    return this.#queue;
  }
}
