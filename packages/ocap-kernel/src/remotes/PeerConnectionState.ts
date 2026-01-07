import type { Logger } from '@metamask/logger';

import { MessageQueue } from './MessageQueue.ts';
import type { RemoteMessageBase } from './RemoteHandle.ts';
import type { Channel } from './types.ts';

/**
 * Pending message awaiting acknowledgment.
 * Sequence number is inferred from position in queue (startSeq + position).
 * Timeout is tracked at the per-peer level (single timeout for queue head).
 */
export type PendingMessage = {
  messageBase: RemoteMessageBase; // Message without seq/ack (added at transmission time)
  sendTimestamp: number; // When first sent (for metrics)
  retryCount: number; // 0 on first send, incremented on retry
  resolve: () => void; // Promise resolver
  reject: (error: Error) => void; // Promise rejector
};

/**
 * Per-peer connection state encapsulating all state for a single peer connection.
 * This consolidates what were previously separate maps indexed by peerId.
 */
export class PeerConnectionState {
  readonly peerId: string;

  #channel: Channel | undefined;

  locationHints: string[];

  #nextSendSeq: number;

  #highestReceivedSeq: number;

  readonly #pendingMessages: MessageQueue;

  #startSeq: number; // Sequence number of first message in queue

  /**
   * Create peer connection state.
   *
   * @param peerId - The peer ID.
   * @param maxQueue - Maximum pending message queue capacity.
   */
  constructor(peerId: string, maxQueue: number) {
    this.peerId = peerId;
    this.#channel = undefined;
    this.locationHints = [];
    this.#nextSendSeq = 0;
    this.#highestReceivedSeq = 0;
    this.#pendingMessages = new MessageQueue(maxQueue);
    this.#startSeq = 0;
  }

  /**
   * Get the current channel.
   *
   * @returns The channel or undefined.
   */
  getChannel(): Channel | undefined {
    return this.#channel;
  }

  /**
   * Set the channel.
   *
   * @param channel - The channel to set.
   */
  setChannel(channel: Channel): void {
    this.#channel = channel;
  }

  /**
   * Clear the channel.
   */
  clearChannel(): void {
    this.#channel = undefined;
  }

  /**
   * Get next sequence number and increment counter.
   *
   * @returns The next sequence number to use.
   */
  getNextSeq(): number {
    this.#nextSendSeq += 1;
    return this.#nextSendSeq;
  }

  /**
   * Get highest received sequence number (for piggyback ACK).
   *
   * @returns The highest sequence number received, or undefined if none.
   */
  getHighestReceivedSeq(): number | undefined {
    return this.#highestReceivedSeq > 0 ? this.#highestReceivedSeq : undefined;
  }

  /**
   * Update highest received sequence number.
   *
   * @param seq - The sequence number received.
   */
  updateReceivedSeq(seq: number): void {
    if (seq > this.#highestReceivedSeq) {
      this.#highestReceivedSeq = seq;
    }
  }

  /**
   * Get pending messages for iteration.
   *
   * @returns Read-only view of pending messages.
   */
  getPendingMessages(): readonly PendingMessage[] {
    return this.#pendingMessages.messages;
  }

  /**
   * Get the first pending message without removing it.
   *
   * @returns The first pending message or undefined if queue is empty.
   */
  peekFirstPending(): PendingMessage | undefined {
    return this.#pendingMessages.peekFirst();
  }

  /**
   * Get sequence number for pending message at position in queue.
   * Sequence number is inferred from position: startSeq + position.
   *
   * @param position - Position in pending messages queue (0-based).
   * @returns The sequence number.
   */
  getSeqForPosition(position: number): number {
    return this.#startSeq + position;
  }

  /**
   * Get current queue length.
   *
   * @returns Number of pending messages.
   */
  getPendingCount(): number {
    return this.#pendingMessages.length;
  }

  /**
   * Add pending message to queue.
   * If this is the first message in an empty queue, also updates startSeq.
   *
   * @param pending - The pending message.
   * @param seq - The sequence number of this message.
   */
  addPendingMessage(pending: PendingMessage, seq: number): void {
    const wasEmpty = this.#pendingMessages.length === 0;
    this.#pendingMessages.enqueue(pending);
    if (wasEmpty) {
      this.#startSeq = seq;
    }
  }

  /**
   * Acknowledge messages up to ackSeq (cumulative ACK).
   * Removes messages from front of queue and updates startSeq.
   *
   * @param ackSeq - Highest sequence being acknowledged.
   * @param logger - Logger for output.
   */
  ackMessages(ackSeq: number, logger: Logger): void {
    while (this.#startSeq <= ackSeq) {
      const pending = this.#pendingMessages.dequeue();
      if (!pending) {
        break;
      }
      pending.resolve();
      logger.log(
        `${this.peerId}:: message ${this.#startSeq} acknowledged (${Date.now() - pending.sendTimestamp}ms)`,
      );
      this.#startSeq += 1; // Move to next sequence number
    }
  }

  /**
   * Reject all pending messages with an error.
   *
   * @param reason - The reason for rejection.
   */
  rejectAllPending(reason: string): void {
    let seq = this.#startSeq;
    for (const pending of this.#pendingMessages.messages) {
      pending.reject(Error(`Message ${seq} delivery failed: ${reason}`));
      seq += 1;
    }
    this.#pendingMessages.clear();
    // Reset startSeq to match nextSendSeq (all pending rejected, queue empty)
    this.#startSeq = this.#nextSendSeq;
  }

  /**
   * Clear sequence numbers (on connection close).
   */
  clearSequenceNumbers(): void {
    this.#nextSendSeq = 0;
    this.#highestReceivedSeq = 0;
    this.#startSeq = 0;
  }
}
