import { describe, it, expect, beforeEach } from 'vitest';

import { MessageQueue } from './MessageQueue.ts';

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
        customQueue.enqueue(`msg${i}`);
      }
      expect(customQueue).toHaveLength(10);
    });
  });

  describe('enqueue', () => {
    it('adds messages to the queue', () => {
      queue.enqueue('message1');
      queue.enqueue('message2');

      expect(queue).toHaveLength(2);
      expect(queue.messages[0]).toBe('message1');
      expect(queue.messages[1]).toBe('message2');
    });

    it('drops oldest message when at capacity', () => {
      const smallQueue = new MessageQueue(3);

      smallQueue.enqueue('msg1');
      smallQueue.enqueue('msg2');
      smallQueue.enqueue('msg3');

      expect(smallQueue).toHaveLength(3);

      // Adding 4th message should drop the first
      smallQueue.enqueue('msg4');

      expect(smallQueue).toHaveLength(3);
      expect(smallQueue.messages[0]).toBe('msg2');
      expect(smallQueue.messages[1]).toBe('msg3');
      expect(smallQueue.messages[2]).toBe('msg4');
    });

    it('maintains FIFO order when dropping messages', () => {
      const smallQueue = new MessageQueue(2);

      smallQueue.enqueue('first');
      smallQueue.enqueue('second');
      smallQueue.enqueue('third');
      smallQueue.enqueue('fourth');

      // Should have dropped 'first' and 'second'
      expect(smallQueue.messages).toStrictEqual(['third', 'fourth']);
    });
  });

  describe('dequeue', () => {
    it('removes and returns the first message', () => {
      queue.enqueue('first');
      queue.enqueue('second');

      const dequeued = queue.dequeue();

      expect(dequeued).toBe('first');
      expect(queue).toHaveLength(1);
      expect(queue.messages[0]).toBe('second');
    });

    it('returns undefined for empty queue', () => {
      expect(queue.dequeue()).toBeUndefined();
    });

    it('maintains FIFO order', () => {
      queue.enqueue('1');
      queue.enqueue('2');
      queue.enqueue('3');

      expect(queue.dequeue()).toBe('1');
      expect(queue.dequeue()).toBe('2');
      expect(queue.dequeue()).toBe('3');
      expect(queue.dequeue()).toBeUndefined();
    });
  });

  describe('dequeueAll', () => {
    it('returns all messages and clears the queue', () => {
      queue.enqueue('msg1');
      queue.enqueue('msg2');
      queue.enqueue('msg3');

      const allMessages = queue.dequeueAll();

      expect(allMessages).toStrictEqual(['msg1', 'msg2', 'msg3']);
      expect(queue).toHaveLength(0);
      expect(queue.messages).toStrictEqual([]);
    });

    it('returns empty array for empty queue', () => {
      const result = queue.dequeueAll();

      expect(result).toStrictEqual([]);
      expect(queue).toHaveLength(0);
    });

    it('returns a copy, not the internal array', () => {
      queue.enqueue('msg');

      const result = queue.dequeueAll();
      result.push('extra');

      // Queue should still be empty after dequeueAll
      expect(queue).toHaveLength(0);
      expect(queue.messages).toStrictEqual([]);
    });
  });

  describe('dropOldest', () => {
    it('removes the first message', () => {
      queue.enqueue('first');
      queue.enqueue('second');
      queue.enqueue('third');

      queue.dropOldest();

      expect(queue).toHaveLength(2);
      expect(queue.messages[0]).toBe('second');
      expect(queue.messages[1]).toBe('third');
    });

    it('handles empty queue gracefully', () => {
      expect(() => queue.dropOldest()).not.toThrow();
      expect(queue).toHaveLength(0);
    });

    it('handles single element queue', () => {
      queue.enqueue('only');

      queue.dropOldest();

      expect(queue).toHaveLength(0);
      expect(queue.messages).toStrictEqual([]);
    });
  });

  describe('clear', () => {
    it('removes all messages', () => {
      queue.enqueue('msg1');
      queue.enqueue('msg2');
      queue.enqueue('msg3');

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
      queue.enqueue('before');
      queue.clear();
      queue.enqueue('after');

      expect(queue).toHaveLength(1);
      expect(queue.messages[0]).toBe('after');
    });
  });

  describe('length getter', () => {
    it('returns correct queue length', () => {
      expect(queue).toHaveLength(0);

      queue.enqueue('1');
      expect(queue).toHaveLength(1);

      queue.enqueue('2');
      expect(queue).toHaveLength(2);

      queue.dequeue();
      expect(queue).toHaveLength(1);

      queue.clear();
      expect(queue).toHaveLength(0);
    });
  });

  describe('messages getter', () => {
    it('returns read-only view of messages', () => {
      queue.enqueue('msg1');
      queue.enqueue('msg2');

      const { messages } = queue;

      expect(messages).toStrictEqual(['msg1', 'msg2']);

      // TypeScript enforces read-only at compile time
      // At runtime, verify the array reference is the internal one
      expect(messages).toBe(queue.messages);
    });

    it('reflects current queue state', () => {
      queue.enqueue('first');
      const messages1 = queue.messages;
      expect(messages1).toHaveLength(1);

      queue.enqueue('second');
      const messages2 = queue.messages;
      expect(messages2).toHaveLength(2);

      queue.dequeue();
      const messages3 = queue.messages;
      expect(messages3).toHaveLength(1);
      expect(messages3[0]).toBe('second');
    });
  });

  describe('replaceAll', () => {
    it('replaces entire queue contents', () => {
      queue.enqueue('old1');
      queue.enqueue('old2');

      const newMessages: string[] = ['new1', 'new2', 'new3'];

      queue.replaceAll(newMessages);

      expect(queue).toHaveLength(3);
      expect(queue.messages).toStrictEqual(newMessages);
    });

    it('handles empty replacement', () => {
      queue.enqueue('msg');

      queue.replaceAll([]);

      expect(queue).toHaveLength(0);
      expect(queue.messages).toStrictEqual([]);
    });

    it('is not affected by changes to input array', () => {
      const messages: string[] = ['msg1'];

      queue.replaceAll(messages);

      // Modify the input array
      messages.push('msg2');
      messages[0] = 'modified';

      // Queue should not be affected
      expect(queue).toHaveLength(1);
      expect(queue.messages[0]).toBe('msg1');
    });

    it('works when replacing with more messages than capacity', () => {
      const smallQueue = new MessageQueue(2);

      const messages: string[] = ['msg1', 'msg2', 'msg3'];

      smallQueue.replaceAll(messages);

      // Should store all messages even if beyond capacity
      // (capacity only applies to enqueue operations)
      expect(smallQueue).toHaveLength(3);
      expect(smallQueue.messages).toStrictEqual(messages);
    });
  });

  describe('integration scenarios', () => {
    it('handles mixed operations correctly', () => {
      queue.enqueue('msg1');
      queue.enqueue('msg2');

      const first = queue.dequeue();
      expect(first).toBe('msg1');

      queue.enqueue('msg3');
      queue.enqueue('msg4');

      expect(queue).toHaveLength(3);

      queue.dropOldest();
      expect(queue.messages[0]).toBe('msg3');

      const all = queue.dequeueAll();
      expect(all).toHaveLength(2);
      expect(queue).toHaveLength(0);

      queue.enqueue('msg5');
      expect(queue).toHaveLength(1);
    });

    it('handles rapid enqueue/dequeue cycles', () => {
      for (let i = 0; i < 100; i += 1) {
        queue.enqueue(`msg${i}`);
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
