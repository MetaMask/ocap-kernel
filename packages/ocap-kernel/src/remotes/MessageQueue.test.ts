import { describe, it, expect, beforeEach, vi } from 'vitest';

import { MessageQueue } from './MessageQueue.ts';
import type { PendingMessage } from './PeerConnectionState.ts';

/**
 * Helper to create mock pending messages for testing.
 *
 * @param id - Identifier for the test message.
 * @returns A mock PendingMessage object.
 */
function createMockPending(id: string): PendingMessage {
  return {
    messageBase: { method: 'deliver', params: [id] },
    sendTimestamp: Date.now(),
    retryCount: 0,
    resolve: vi.fn(),
    reject: vi.fn(),
  };
}

describe('MessageQueue', () => {
  let queue: MessageQueue;

  beforeEach(() => {
    queue = new MessageQueue();
  });

  describe('constructor', () => {
    it('creates an empty queue with default capacity', () => {
      expect(queue).toHaveLength(0);
      expect(queue.messages).toStrictEqual([]);
    });

    it('accepts custom max capacity', () => {
      const customQueue = new MessageQueue(10);
      expect(customQueue).toHaveLength(0);

      // Fill beyond custom capacity to test it's respected
      for (let i = 0; i < 11; i += 1) {
        customQueue.enqueue(createMockPending(`msg${i}`));
      }
      expect(customQueue).toHaveLength(10);
    });
  });

  describe('enqueue', () => {
    it('adds messages to the queue', () => {
      const msg1 = createMockPending('message1');
      const msg2 = createMockPending('message2');

      queue.enqueue(msg1);
      queue.enqueue(msg2);

      expect(queue).toHaveLength(2);
      expect(queue.messages[0]).toBe(msg1);
      expect(queue.messages[1]).toBe(msg2);
    });

    it('rejects new message when at capacity', () => {
      const smallQueue = new MessageQueue(3);

      const msg1 = createMockPending('msg1');
      const msg2 = createMockPending('msg2');
      const msg3 = createMockPending('msg3');
      const msg4 = createMockPending('msg4');

      expect(smallQueue.enqueue(msg1)).toBe(true);
      expect(smallQueue.enqueue(msg2)).toBe(true);
      expect(smallQueue.enqueue(msg3)).toBe(true);

      expect(smallQueue).toHaveLength(3);

      // Adding 4th message should reject it, not add it
      expect(smallQueue.enqueue(msg4)).toBe(false);

      // Queue unchanged - still has original 3 messages
      expect(smallQueue).toHaveLength(3);
      expect(smallQueue.messages[0]).toBe(msg1);
      expect(smallQueue.messages[1]).toBe(msg2);
      expect(smallQueue.messages[2]).toBe(msg3);

      // Verify msg4 (the new one) was rejected
      expect(msg4.reject).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Message rejected: queue at capacity',
        }),
      );

      // Original messages not rejected
      expect(msg1.reject).not.toHaveBeenCalled();
      expect(msg2.reject).not.toHaveBeenCalled();
      expect(msg3.reject).not.toHaveBeenCalled();
    });

    it('returns true when message added successfully', () => {
      const pending = createMockPending('test');
      expect(queue.enqueue(pending)).toBe(true);
      expect(queue).toHaveLength(1);
    });
  });

  describe('dequeue', () => {
    it('removes and returns the first message', () => {
      const first = createMockPending('first');
      const second = createMockPending('second');

      queue.enqueue(first);
      queue.enqueue(second);

      const dequeued = queue.dequeue();

      expect(dequeued).toBe(first);
      expect(queue).toHaveLength(1);
      expect(queue.messages[0]).toBe(second);
    });

    it('returns undefined for empty queue', () => {
      expect(queue.dequeue()).toBeUndefined();
    });

    it('maintains FIFO order', () => {
      const msg1 = createMockPending('1');
      const msg2 = createMockPending('2');
      const msg3 = createMockPending('3');

      queue.enqueue(msg1);
      queue.enqueue(msg2);
      queue.enqueue(msg3);

      expect(queue.dequeue()).toBe(msg1);
      expect(queue.dequeue()).toBe(msg2);
      expect(queue.dequeue()).toBe(msg3);
      expect(queue.dequeue()).toBeUndefined();
    });
  });

  describe('peekFirst', () => {
    it('returns first message without removing it', () => {
      const first = createMockPending('first');
      const second = createMockPending('second');

      queue.enqueue(first);
      queue.enqueue(second);

      const peeked = queue.peekFirst();

      expect(peeked).toBe(first);
      expect(queue).toHaveLength(2);
    });

    it('returns undefined for empty queue', () => {
      expect(queue.peekFirst()).toBeUndefined();
    });

    it('returns same element on multiple calls', () => {
      const only = createMockPending('only');

      queue.enqueue(only);

      expect(queue.peekFirst()).toBe(only);
      expect(queue.peekFirst()).toBe(only);
      expect(queue).toHaveLength(1);
    });
  });

  describe('clear', () => {
    it('removes all messages', () => {
      queue.enqueue(createMockPending('msg1'));
      queue.enqueue(createMockPending('msg2'));
      queue.enqueue(createMockPending('msg3'));

      queue.clear();

      expect(queue).toHaveLength(0);
      expect(queue.messages).toStrictEqual([]);
    });

    it('works on empty queue', () => {
      queue.clear();

      expect(queue).toHaveLength(0);
      expect(queue.messages).toStrictEqual([]);
    });

    it('allows enqueueing after clear', () => {
      const before = createMockPending('before');
      const after = createMockPending('after');

      queue.enqueue(before);
      queue.clear();
      queue.enqueue(after);

      expect(queue).toHaveLength(1);
      expect(queue.messages[0]).toBe(after);
    });
  });

  describe('length getter', () => {
    it('returns correct queue length', () => {
      expect(queue).toHaveLength(0);

      queue.enqueue(createMockPending('1'));
      expect(queue).toHaveLength(1);

      queue.enqueue(createMockPending('2'));
      expect(queue).toHaveLength(2);

      queue.dequeue();
      expect(queue).toHaveLength(1);

      queue.clear();
      expect(queue).toHaveLength(0);
    });
  });

  describe('messages getter', () => {
    it('returns read-only view of messages', () => {
      const msg1 = createMockPending('msg1');
      const msg2 = createMockPending('msg2');

      queue.enqueue(msg1);
      queue.enqueue(msg2);

      const { messages } = queue;

      expect(messages).toStrictEqual([msg1, msg2]);

      // TypeScript enforces read-only at compile time
      // At runtime, verify the array reference is the internal one
      expect(messages).toBe(queue.messages);
    });

    it('reflects current queue state', () => {
      const first = createMockPending('first');
      const second = createMockPending('second');

      queue.enqueue(first);
      const messages1 = queue.messages;
      expect(messages1).toHaveLength(1);

      queue.enqueue(second);
      const messages2 = queue.messages;
      expect(messages2).toHaveLength(2);

      queue.dequeue();
      const messages3 = queue.messages;
      expect(messages3).toHaveLength(1);
      expect(messages3[0]).toBe(second);
    });
  });

  describe('integration scenarios', () => {
    it('handles mixed operations correctly', () => {
      const msg1 = createMockPending('msg1');
      const msg2 = createMockPending('msg2');
      const msg3 = createMockPending('msg3');
      const msg4 = createMockPending('msg4');
      const msg5 = createMockPending('msg5');

      queue.enqueue(msg1);
      queue.enqueue(msg2);

      const first = queue.dequeue();
      expect(first).toBe(msg1);

      queue.enqueue(msg3);
      queue.enqueue(msg4);

      expect(queue).toHaveLength(3);

      const peeked = queue.peekFirst();
      expect(peeked).toBe(msg2);

      const second = queue.dequeue();
      expect(second).toBe(msg2);
      expect(queue.messages[0]).toBe(msg3);

      queue.clear();
      expect(queue).toHaveLength(0);

      queue.enqueue(msg5);
      expect(queue).toHaveLength(1);
    });

    it('handles rapid enqueue/dequeue cycles', () => {
      for (let i = 0; i < 100; i += 1) {
        queue.enqueue(createMockPending(`msg${i}`));
        if (i % 3 === 0) {
          queue.dequeue();
        }
      }

      // Should have roughly 2/3 of the messages
      expect(queue.length).toBeGreaterThan(60);
      expect(queue.length).toBeLessThanOrEqual(200); // Max capacity
    });
  });
});
