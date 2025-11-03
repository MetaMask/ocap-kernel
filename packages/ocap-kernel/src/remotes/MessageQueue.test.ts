import { describe, it, expect, beforeEach } from 'vitest';

import { MessageQueue } from './MessageQueue.ts';
import type { QueuedMessage } from './MessageQueue.ts';

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
        customQueue.enqueue(`msg${i}`, []);
      }
      expect(customQueue).toHaveLength(10);
    });
  });

  describe('enqueue', () => {
    it('adds messages to the queue', () => {
      queue.enqueue('message1', ['hint1']);
      queue.enqueue('message2', ['hint2', 'hint3']);

      expect(queue).toHaveLength(2);
      expect(queue.messages[0]).toStrictEqual({
        message: 'message1',
        hints: ['hint1'],
      });
      expect(queue.messages[1]).toStrictEqual({
        message: 'message2',
        hints: ['hint2', 'hint3'],
      });
    });

    it('handles empty hints array', () => {
      queue.enqueue('message', []);

      expect(queue.messages[0]).toStrictEqual({
        message: 'message',
        hints: [],
      });
    });

    it('drops oldest message when at capacity', () => {
      const smallQueue = new MessageQueue(3);

      smallQueue.enqueue('msg1', ['hint1']);
      smallQueue.enqueue('msg2', ['hint2']);
      smallQueue.enqueue('msg3', ['hint3']);

      expect(smallQueue).toHaveLength(3);

      // Adding 4th message should drop the first
      smallQueue.enqueue('msg4', ['hint4']);

      expect(smallQueue).toHaveLength(3);
      expect(smallQueue.messages[0]?.message).toBe('msg2');
      expect(smallQueue.messages[1]?.message).toBe('msg3');
      expect(smallQueue.messages[2]?.message).toBe('msg4');
    });

    it('maintains FIFO order when dropping messages', () => {
      const smallQueue = new MessageQueue(2);

      smallQueue.enqueue('first', ['a']);
      smallQueue.enqueue('second', ['b']);
      smallQueue.enqueue('third', ['c']);
      smallQueue.enqueue('fourth', ['d']);

      // Should have dropped 'first' and 'second'
      expect(smallQueue.messages).toStrictEqual([
        { message: 'third', hints: ['c'] },
        { message: 'fourth', hints: ['d'] },
      ]);
    });
  });

  describe('dequeue', () => {
    it('removes and returns the first message', () => {
      queue.enqueue('first', ['hint1']);
      queue.enqueue('second', ['hint2']);

      const dequeued = queue.dequeue();

      expect(dequeued).toStrictEqual({
        message: 'first',
        hints: ['hint1'],
      });
      expect(queue).toHaveLength(1);
      expect(queue.messages[0]?.message).toBe('second');
    });

    it('returns undefined for empty queue', () => {
      expect(queue.dequeue()).toBeUndefined();
    });

    it('maintains FIFO order', () => {
      queue.enqueue('1', ['a']);
      queue.enqueue('2', ['b']);
      queue.enqueue('3', ['c']);

      expect(queue.dequeue()?.message).toBe('1');
      expect(queue.dequeue()?.message).toBe('2');
      expect(queue.dequeue()?.message).toBe('3');
      expect(queue.dequeue()).toBeUndefined();
    });
  });

  describe('dequeueAll', () => {
    it('returns all messages and clears the queue', () => {
      queue.enqueue('msg1', ['hint1']);
      queue.enqueue('msg2', ['hint2']);
      queue.enqueue('msg3', ['hint3']);

      const allMessages = queue.dequeueAll();

      expect(allMessages).toStrictEqual([
        { message: 'msg1', hints: ['hint1'] },
        { message: 'msg2', hints: ['hint2'] },
        { message: 'msg3', hints: ['hint3'] },
      ]);
      expect(queue).toHaveLength(0);
      expect(queue.messages).toStrictEqual([]);
    });

    it('returns empty array for empty queue', () => {
      const result = queue.dequeueAll();

      expect(result).toStrictEqual([]);
      expect(queue).toHaveLength(0);
    });

    it('returns a copy, not the internal array', () => {
      queue.enqueue('msg', ['hint']);

      const result = queue.dequeueAll();
      result.push({ message: 'extra', hints: [] });

      // Queue should still be empty after dequeueAll
      expect(queue).toHaveLength(0);
      expect(queue.messages).toStrictEqual([]);
    });
  });

  describe('dropOldest', () => {
    it('removes the first message', () => {
      queue.enqueue('first', ['a']);
      queue.enqueue('second', ['b']);
      queue.enqueue('third', ['c']);

      queue.dropOldest();

      expect(queue).toHaveLength(2);
      expect(queue.messages[0]?.message).toBe('second');
      expect(queue.messages[1]?.message).toBe('third');
    });

    it('handles empty queue gracefully', () => {
      expect(() => queue.dropOldest()).not.toThrow();
      expect(queue).toHaveLength(0);
    });

    it('handles single element queue', () => {
      queue.enqueue('only', ['hint']);

      queue.dropOldest();

      expect(queue).toHaveLength(0);
      expect(queue.messages).toStrictEqual([]);
    });
  });

  describe('clear', () => {
    it('removes all messages', () => {
      queue.enqueue('msg1', ['hint1']);
      queue.enqueue('msg2', ['hint2']);
      queue.enqueue('msg3', ['hint3']);

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
      queue.enqueue('before', ['hint']);
      queue.clear();
      queue.enqueue('after', ['new']);

      expect(queue).toHaveLength(1);
      expect(queue.messages[0]?.message).toBe('after');
    });
  });

  describe('length getter', () => {
    it('returns correct queue length', () => {
      expect(queue).toHaveLength(0);

      queue.enqueue('1', []);
      expect(queue).toHaveLength(1);

      queue.enqueue('2', []);
      expect(queue).toHaveLength(2);

      queue.dequeue();
      expect(queue).toHaveLength(1);

      queue.clear();
      expect(queue).toHaveLength(0);
    });
  });

  describe('messages getter', () => {
    it('returns read-only view of messages', () => {
      queue.enqueue('msg1', ['hint1']);
      queue.enqueue('msg2', ['hint2']);

      const { messages } = queue;

      expect(messages).toStrictEqual([
        { message: 'msg1', hints: ['hint1'] },
        { message: 'msg2', hints: ['hint2'] },
      ]);

      // TypeScript enforces read-only at compile time
      // At runtime, verify the array reference is the internal one
      expect(messages).toBe(queue.messages);
    });

    it('reflects current queue state', () => {
      queue.enqueue('first', ['a']);
      const messages1 = queue.messages;
      expect(messages1).toHaveLength(1);

      queue.enqueue('second', ['b']);
      const messages2 = queue.messages;
      expect(messages2).toHaveLength(2);

      queue.dequeue();
      const messages3 = queue.messages;
      expect(messages3).toHaveLength(1);
      expect(messages3[0]?.message).toBe('second');
    });
  });

  describe('replaceAll', () => {
    it('replaces entire queue contents', () => {
      queue.enqueue('old1', ['a']);
      queue.enqueue('old2', ['b']);

      const newMessages: QueuedMessage[] = [
        { message: 'new1', hints: ['x'] },
        { message: 'new2', hints: ['y'] },
        { message: 'new3', hints: ['z'] },
      ];

      queue.replaceAll(newMessages);

      expect(queue).toHaveLength(3);
      expect(queue.messages).toStrictEqual(newMessages);
    });

    it('handles empty replacement', () => {
      queue.enqueue('msg', ['hint']);

      queue.replaceAll([]);

      expect(queue).toHaveLength(0);
      expect(queue.messages).toStrictEqual([]);
    });

    it('is not affected by changes to input array', () => {
      const messages: QueuedMessage[] = [{ message: 'msg1', hints: ['h1'] }];

      queue.replaceAll(messages);

      // Modify the input array
      messages.push({ message: 'msg2', hints: ['h2'] });
      messages[0] = { message: 'modified', hints: ['mod'] };

      // Queue should not be affected
      expect(queue).toHaveLength(1);
      expect(queue.messages[0]).toStrictEqual({
        message: 'msg1',
        hints: ['h1'],
      });
    });

    it('works when replacing with more messages than capacity', () => {
      const smallQueue = new MessageQueue(2);

      const messages: QueuedMessage[] = [
        { message: 'msg1', hints: [] },
        { message: 'msg2', hints: [] },
        { message: 'msg3', hints: [] },
      ];

      smallQueue.replaceAll(messages);

      // Should store all messages even if beyond capacity
      // (capacity only applies to enqueue operations)
      expect(smallQueue).toHaveLength(3);
      expect(smallQueue.messages).toStrictEqual(messages);
    });
  });

  describe('integration scenarios', () => {
    it('handles mixed operations correctly', () => {
      queue.enqueue('msg1', ['hint1']);
      queue.enqueue('msg2', ['hint2']);

      const first = queue.dequeue();
      expect(first?.message).toBe('msg1');

      queue.enqueue('msg3', ['hint3']);
      queue.enqueue('msg4', ['hint4']);

      expect(queue).toHaveLength(3);

      queue.dropOldest();
      expect(queue.messages[0]?.message).toBe('msg3');

      const all = queue.dequeueAll();
      expect(all).toHaveLength(2);
      expect(queue).toHaveLength(0);

      queue.enqueue('msg5', ['hint5']);
      expect(queue).toHaveLength(1);
    });

    it('preserves hints through all operations', () => {
      const complexHints = ['hint1', 'hint2', 'hint3'];

      queue.enqueue('msg', complexHints);

      // Through dequeue
      const dequeued = queue.dequeue();
      expect(dequeued?.hints).toStrictEqual(complexHints);

      // Through dequeueAll
      queue.enqueue('msg2', complexHints);
      const all = queue.dequeueAll();
      expect(all[0]?.hints).toStrictEqual(complexHints);

      // Through replaceAll
      queue.replaceAll([{ message: 'replaced', hints: complexHints }]);
      expect(queue.messages[0]?.hints).toStrictEqual(complexHints);
    });

    it('handles rapid enqueue/dequeue cycles', () => {
      for (let i = 0; i < 100; i += 1) {
        queue.enqueue(`msg${i}`, [`hint${i}`]);
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
