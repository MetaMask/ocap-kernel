import type { KVStore } from '@ocap/store';
import { describe, it, expect, beforeEach } from 'vitest';

import { getQueueMethods } from './queue.ts';
import { makeMapKVStore } from '../../../test/storage.ts';

describe('queue-methods', () => {
  let kv: KVStore;
  let queueStore: ReturnType<typeof getQueueMethods>;

  beforeEach(() => {
    kv = makeMapKVStore();
    queueStore = getQueueMethods(kv);
  });

  describe('createStoredQueue', () => {
    it('creates a new empty queue', () => {
      queueStore.createStoredQueue('test-queue');
      expect(kv.get('queue.test-queue.head')).toBe('1');
      expect(kv.get('queue.test-queue.tail')).toBe('1');
    });

    it('creates a cached queue when specified', () => {
      queueStore.createStoredQueue('cached-queue', true);
      expect(kv.get('queue.cached-queue.head')).toBe('1');
      expect(kv.get('queue.cached-queue.tail')).toBe('1');
    });
  });

  describe('provideStoredQueue', () => {
    it('throws an error for uninitialized queues', () => {
      expect(() => queueStore.provideStoredQueue('nonexistent')).toThrow(
        'queue nonexistent not initialized',
      );
    });

    it('provides access to an existing queue', () => {
      // Create a queue first
      queueStore.createStoredQueue('existing-queue');

      // Then access it
      const queue = queueStore.provideStoredQueue('existing-queue');
      expect(queue).toBeDefined();
    });
  });

  describe('queue operations', () => {
    it('enqueues and dequeues items correctly', () => {
      const queue = queueStore.createStoredQueue('ops-queue');

      // Enqueue items
      queue.enqueue({ id: 1, value: 'first' });
      queue.enqueue({ id: 2, value: 'second' });

      // Check queue length
      expect(queueStore.getQueueLength('ops-queue')).toBe(2);

      // Dequeue items in FIFO order
      const item1 = queue.dequeue();
      expect(item1).toStrictEqual({ id: 1, value: 'first' });

      const item2 = queue.dequeue();
      expect(item2).toStrictEqual({ id: 2, value: 'second' });

      // Queue should be empty now
      expect(queueStore.getQueueLength('ops-queue')).toBe(0);

      // Dequeue from empty queue returns undefined
      const emptyResult = queue.dequeue();
      expect(emptyResult).toBeUndefined();
    });

    it('handles complex objects in the queue', () => {
      const queue = queueStore.createStoredQueue('complex-queue');

      const complexObject = {
        id: 123,
        nested: {
          array: [1, 2, 3],
          map: { a: 1, b: 2 },
        },
        date: new Date().toISOString(),
      };

      queue.enqueue(complexObject);
      const result = queue.dequeue();

      expect(result).toStrictEqual(complexObject);
    });

    it('deletes queues correctly', () => {
      const queue = queueStore.createStoredQueue('delete-queue');

      // Add some items
      queue.enqueue({ id: 1 });
      queue.enqueue({ id: 2 });
      queue.enqueue({ id: 3 });

      // Delete the queue
      queue.delete();

      // Queue metadata should be gone
      expect(kv.get('queue.delete-queue.head')).toBeUndefined();
      expect(kv.get('queue.delete-queue.tail')).toBeUndefined();

      // Queue entries should be gone
      expect(kv.get('queue.delete-queue.1')).toBeUndefined();
      expect(kv.get('queue.delete-queue.2')).toBeUndefined();
      expect(kv.get('queue.delete-queue.3')).toBeUndefined();

      // Operations on deleted queue should behave appropriately
      expect(queue.dequeue()).toBeUndefined();
      expect(() => queue.enqueue({ id: 4 })).toThrow(
        'enqueue into deleted queue delete-queue',
      );
    });
  });

  describe('getQueueLength', () => {
    it('returns the correct queue length', () => {
      const queue = queueStore.createStoredQueue('length-queue');

      expect(queueStore.getQueueLength('length-queue')).toBe(0);

      queue.enqueue({ id: 1 });
      expect(queueStore.getQueueLength('length-queue')).toBe(1);

      queue.enqueue({ id: 2 });
      queue.enqueue({ id: 3 });
      expect(queueStore.getQueueLength('length-queue')).toBe(3);

      queue.dequeue();
      expect(queueStore.getQueueLength('length-queue')).toBe(2);

      queue.dequeue();
      queue.dequeue();
      expect(queueStore.getQueueLength('length-queue')).toBe(0);
    });

    it('throws an error for unknown queues', () => {
      expect(() => queueStore.getQueueLength('unknown-queue')).toThrow(
        'unknown queue unknown-queue',
      );
    });
  });

  describe('cached vs uncached queues', () => {
    it('both cached and uncached queues work the same way', () => {
      const cachedQueue = queueStore.createStoredQueue('cached-queue', true);
      const uncachedQueue = queueStore.createStoredQueue(
        'uncached-queue',
        false,
      );

      // Add same items to both queues
      cachedQueue.enqueue({ id: 1 });
      uncachedQueue.enqueue({ id: 1 });

      cachedQueue.enqueue({ id: 2 });
      uncachedQueue.enqueue({ id: 2 });

      // Both should have same length
      expect(queueStore.getQueueLength('cached-queue')).toBe(2);
      expect(queueStore.getQueueLength('uncached-queue')).toBe(2);

      // Both should dequeue the same items
      expect(cachedQueue.dequeue()).toStrictEqual({ id: 1 });
      expect(uncachedQueue.dequeue()).toStrictEqual({ id: 1 });

      expect(cachedQueue.dequeue()).toStrictEqual({ id: 2 });
      expect(uncachedQueue.dequeue()).toStrictEqual({ id: 2 });

      // Both should be empty
      expect(queueStore.getQueueLength('cached-queue')).toBe(0);
      expect(queueStore.getQueueLength('uncached-queue')).toBe(0);
    });

    it('cached vs uncached queues handle external changes differently', () => {
      // First, let's create two separate queues
      const cachedQueue = queueStore.createStoredQueue('cached-test', true);
      const uncachedQueue = queueStore.createStoredQueue(
        'uncached-test',
        false,
      );

      // Add an item to each queue to advance the head counter
      cachedQueue.enqueue({ test: 'cached' });
      uncachedQueue.enqueue({ test: 'uncached' });

      // Both heads should now be at 2
      expect(kv.get('queue.cached-test.head')).toBe('2');
      expect(kv.get('queue.uncached-test.head')).toBe('2');

      // Now let's modify the KV store directly for both queues
      kv.set('queue.cached-test.head', '10');
      kv.set('queue.uncached-test.head', '10');

      // Enqueue new items
      cachedQueue.enqueue({ test: 'cached-after-change' });
      uncachedQueue.enqueue({ test: 'uncached-after-change' });

      // For the cached queue, the cached head value (2) should have been used,
      // so the item should be at position 2
      expect(kv.get('queue.cached-test.2')).toBeDefined();

      // For the uncached queue, the modified head value (10) should have been used,
      // so the item should be at position 10
      expect(kv.get('queue.uncached-test.10')).toBeDefined();

      // The heads should now be at 3 and 11 respectively
      expect(kv.get('queue.cached-test.head')).toBe('3');
      expect(kv.get('queue.uncached-test.head')).toBe('11');
    });
  });

  describe('integration', () => {
    it('supports multiple queues simultaneously', () => {
      const queue1 = queueStore.createStoredQueue('queue1');
      const queue2 = queueStore.createStoredQueue('queue2');

      queue1.enqueue({ id: 'q1-1' });
      queue2.enqueue({ id: 'q2-1' });
      queue1.enqueue({ id: 'q1-2' });
      queue2.enqueue({ id: 'q2-2' });

      expect(queueStore.getQueueLength('queue1')).toBe(2);
      expect(queueStore.getQueueLength('queue2')).toBe(2);

      expect(queue1.dequeue()).toStrictEqual({ id: 'q1-1' });
      expect(queue2.dequeue()).toStrictEqual({ id: 'q2-1' });

      expect(queueStore.getQueueLength('queue1')).toBe(1);
      expect(queueStore.getQueueLength('queue2')).toBe(1);

      queue1.delete();
      expect(() => queueStore.getQueueLength('queue1')).toThrow(
        'unknown queue queue1',
      );
      expect(queueStore.getQueueLength('queue2')).toBe(1);
    });

    it('handles a large number of queue operations', () => {
      const queue = queueStore.createStoredQueue('large-queue');

      // Enqueue 100 items
      for (let i = 0; i < 100; i++) {
        queue.enqueue({ index: i });
      }

      expect(queueStore.getQueueLength('large-queue')).toBe(100);

      // Dequeue 50 items
      for (let i = 0; i < 50; i++) {
        const item = queue.dequeue();
        expect(item).toStrictEqual({ index: i });
      }

      expect(queueStore.getQueueLength('large-queue')).toBe(50);

      // Enqueue 50 more
      for (let i = 100; i < 150; i++) {
        queue.enqueue({ index: i });
      }

      expect(queueStore.getQueueLength('large-queue')).toBe(100);

      // Dequeue all remaining
      for (let i = 50; i < 150; i++) {
        const item = queue.dequeue();
        expect(item).toStrictEqual({ index: i });
      }

      expect(queueStore.getQueueLength('large-queue')).toBe(0);
    });
  });
});
