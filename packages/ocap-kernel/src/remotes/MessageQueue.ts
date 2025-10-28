export type QueuedMessage = {
  message: string;
  hints: string[];
};

/**
 * Message queue management for remote communications.
 * Handles queueing of messages with their hints during reconnection.
 */
export class MessageQueue {
  readonly #queue: QueuedMessage[] = [];

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
   * Add a message to the queue.
   * If at capacity, drops the oldest message first.
   *
   * @param message - The message to add to the queue.
   * @param hints - The hints to add to the queue.
   */
  enqueue(message: string, hints: string[]): void {
    if (this.#queue.length >= this.#maxCapacity) {
      this.dropOldest();
    }
    this.#queue.push({ message, hints });
  }

  /**
   * Remove and return the first message in the queue.
   *
   * @returns The first message in the queue, or undefined if the queue is empty.
   */
  dequeue(): QueuedMessage | undefined {
    return this.#queue.shift();
  }

  /**
   * Get all messages and clear the queue.
   *
   * @returns All messages in the queue.
   */
  dequeueAll(): QueuedMessage[] {
    const messages = [...this.#queue];
    this.#queue.length = 0;
    return messages;
  }

  /**
   * Drop the oldest message from the queue.
   */
  dropOldest(): void {
    this.#queue.shift();
  }

  /**
   * Clear all messages from the queue.
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
   * Get a read-only view of the messages.
   *
   * @returns A read-only view of the messages.
   */
  get messages(): readonly QueuedMessage[] {
    return this.#queue;
  }

  /**
   * Replace the entire queue with new messages.
   *
   * @param messages - The new messages to replace the queue with.
   */
  replaceAll(messages: QueuedMessage[]): void {
    this.#queue.length = 0;
    this.#queue.push(...messages);
  }
}
