import { describe, it, expect, beforeEach, vi } from 'vitest';

import * as objectModule from './object.ts';
import { getQueueMethods } from './queue.ts';
import type { RunQueueItem } from '../../types.ts';
import type { StoreContext } from '../types.ts';

// Mock dependencies
vi.mock('./object.ts', () => ({
  getObjectMethods: vi.fn(),
}));

describe('queue store methods', () => {
  let mockKV: Map<string, string>;
  let mockRunQueue = {
    enqueue: vi.fn(),
    dequeue: vi.fn(),
  };
  let context: StoreContext;
  let queueMethods: ReturnType<typeof getQueueMethods>;
  const mockGetOwner = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    mockKV = new Map();
    mockRunQueue = {
      enqueue: vi.fn(),
      dequeue: vi.fn(),
    };

    // Set up mock implementation for getObjectMethods
    (objectModule.getObjectMethods as ReturnType<typeof vi.fn>).mockReturnValue(
      {
        getOwner: mockGetOwner,
      },
    );

    // Configure mock getOwner behavior
    mockGetOwner.mockImplementation((target: string) => {
      if (target === 'o+1') {
        return 'v1';
      }
      if (target === 'o+2') {
        return 'v2';
      }
      return undefined;
    });

    context = {
      kv: {
        get: (key: string): string | undefined => mockKV.get(key),
        getRequired: (key: string): string => {
          const value = mockKV.get(key);
          if (value === undefined) {
            throw new Error(`Required key ${key} not found`);
          }
          return value;
        },
        set: (key: string, value: string): void => {
          mockKV.set(key, value);
        },
        delete: (key: string): void => {
          mockKV.delete(key);
        },
      },
      runQueue: mockRunQueue,
      runQueueLengthCache: 0,
    } as unknown as StoreContext;

    queueMethods = getQueueMethods(context);
  });

  describe('getQueueLength', () => {
    it('calculates queue length from head and tail', () => {
      mockKV.set('queue.test.head', '10');
      mockKV.set('queue.test.tail', '3');

      const result = queueMethods.getQueueLength('test');

      expect(result).toBe(7);
    });

    it('returns zero for empty queue', () => {
      mockKV.set('queue.test.head', '5');
      mockKV.set('queue.test.tail', '5');

      const result = queueMethods.getQueueLength('test');

      expect(result).toBe(0);
    });

    it('throws error if queue does not exist', () => {
      expect(() => queueMethods.getQueueLength('nonexistent')).toThrow(
        'unknown queue nonexistent',
      );
    });

    it('throws error if only head exists', () => {
      mockKV.set('queue.test.head', '5');

      expect(() => queueMethods.getQueueLength('test')).toThrow(
        'unknown queue test',
      );
    });

    it('throws error if only tail exists', () => {
      mockKV.set('queue.test.tail', '3');

      expect(() => queueMethods.getQueueLength('test')).toThrow(
        'unknown queue test',
      );
    });
  });

  describe('enqueueRun', () => {
    it('increments runQueueLengthCache and enqueues the message', () => {
      const message: RunQueueItem = {
        type: 'message',
        data: { some: 'data' },
      } as unknown as RunQueueItem;

      queueMethods.enqueueRun(message);

      expect(context.runQueueLengthCache).toBe(1);
      expect(mockRunQueue.enqueue).toHaveBeenCalledWith(message);
    });

    it('increments runQueueLengthCache multiple times correctly', () => {
      const message1: RunQueueItem = {
        type: 'message',
        data: { id: 1 },
      } as unknown as RunQueueItem;
      const message2: RunQueueItem = {
        type: 'message',
        data: { id: 2 },
      } as unknown as RunQueueItem;

      queueMethods.enqueueRun(message1);
      queueMethods.enqueueRun(message2);

      expect(context.runQueueLengthCache).toBe(2);
      expect(mockRunQueue.enqueue).toHaveBeenCalledTimes(2);
      expect(mockRunQueue.enqueue).toHaveBeenNthCalledWith(1, message1);
      expect(mockRunQueue.enqueue).toHaveBeenNthCalledWith(2, message2);
    });
  });

  describe('dequeueRun', () => {
    it('decrements runQueueLengthCache and returns the dequeued message', () => {
      const message: RunQueueItem = {
        type: 'message',
        data: { some: 'data' },
      } as unknown as RunQueueItem;
      mockRunQueue.dequeue.mockReturnValue(message);
      context.runQueueLengthCache = 1;

      const result = queueMethods.dequeueRun();

      expect(context.runQueueLengthCache).toBe(0);
      expect(mockRunQueue.dequeue).toHaveBeenCalled();
      expect(result).toStrictEqual(message);
    });

    it('decrements runQueueLengthCache and returns undefined when queue is empty', () => {
      mockRunQueue.dequeue.mockReturnValue(undefined);
      context.runQueueLengthCache = 1;

      const result = queueMethods.dequeueRun();

      expect(context.runQueueLengthCache).toBe(0);
      expect(mockRunQueue.dequeue).toHaveBeenCalled();
      expect(result).toBeUndefined();
    });

    it('works correctly when called multiple times', () => {
      const message1: RunQueueItem = {
        type: 'message',
        data: { id: 1 },
      } as unknown as RunQueueItem;
      const message2: RunQueueItem = {
        type: 'message',
        data: { id: 2 },
      } as unknown as RunQueueItem;

      mockRunQueue.dequeue
        .mockReturnValueOnce(message1)
        .mockReturnValueOnce(message2)
        .mockReturnValueOnce(undefined);

      context.runQueueLengthCache = 3;

      expect(queueMethods.dequeueRun()).toStrictEqual(message1);
      expect(context.runQueueLengthCache).toBe(2);

      expect(queueMethods.dequeueRun()).toStrictEqual(message2);
      expect(context.runQueueLengthCache).toBe(1);

      expect(queueMethods.dequeueRun()).toBeUndefined();
      expect(context.runQueueLengthCache).toBe(0);
    });
  });

  describe('runQueueLength', () => {
    it('returns the cached run queue length when cache is valid', () => {
      context.runQueueLengthCache = 5;

      const result = queueMethods.runQueueLength();

      expect(result).toBe(5);
    });

    it('recalculates queue length when cache is negative', () => {
      context.runQueueLengthCache = -1;
      mockKV.set('queue.run.head', '8');
      mockKV.set('queue.run.tail', '3');

      const result = queueMethods.runQueueLength();

      expect(result).toBe(5);
      expect(context.runQueueLengthCache).toBe(5);
    });

    it('keeps the recalculated value in cache for subsequent calls', () => {
      context.runQueueLengthCache = -1;
      mockKV.set('queue.run.head', '8');
      mockKV.set('queue.run.tail', '3');

      queueMethods.runQueueLength(); // First call recalculates
      const result = queueMethods.runQueueLength(); // Second call should use cache

      expect(result).toBe(5);
      expect(context.runQueueLengthCache).toBe(5);
    });

    it('throws error when recalculating if run queue does not exist', () => {
      context.runQueueLengthCache = -1;

      expect(() => queueMethods.runQueueLength()).toThrow('unknown queue run');
    });
  });

  describe('getRunQueueItemTargetVatId', () => {
    it('returns owner vat for send items', () => {
      const sendItem: RunQueueItem = {
        type: 'send',
        target: 'o+1',
        message: { methargs: { body: '', slots: [] }, result: null },
      };

      const result = queueMethods.getRunQueueItemTargetVatId(sendItem);

      expect(mockGetOwner).toHaveBeenCalledWith('o+1', false);
      expect(result).toBe('v1');
    });

    it('returns vatId for notify items', () => {
      const notifyItem: RunQueueItem = {
        type: 'notify',
        vatId: 'v2',
        kpid: 'kp123',
      };

      const result = queueMethods.getRunQueueItemTargetVatId(notifyItem);

      expect(result).toBe('v2');
    });

    it('returns vatId for dropExports items', () => {
      const dropExportsItem: RunQueueItem = {
        type: 'dropExports',
        vatId: 'v3',
        krefs: ['o+1', 'o+2'],
      };

      const result = queueMethods.getRunQueueItemTargetVatId(dropExportsItem);

      expect(result).toBe('v3');
    });

    it('returns vatId for retireExports items', () => {
      const retireExportsItem: RunQueueItem = {
        type: 'retireExports',
        vatId: 'v4',
        krefs: ['o+1', 'o+2'],
      };

      const result = queueMethods.getRunQueueItemTargetVatId(retireExportsItem);

      expect(result).toBe('v4');
    });

    it('returns vatId for retireImports items', () => {
      const retireImportsItem: RunQueueItem = {
        type: 'retireImports',
        vatId: 'v5',
        krefs: ['o-1', 'o-2'],
      };

      const result = queueMethods.getRunQueueItemTargetVatId(retireImportsItem);

      expect(result).toBe('v5');
    });

    it('returns vatId for bringOutYourDead items', () => {
      const bringOutYourDeadItem: RunQueueItem = {
        type: 'bringOutYourDead',
        vatId: 'v6',
      };

      const result =
        queueMethods.getRunQueueItemTargetVatId(bringOutYourDeadItem);

      expect(result).toBe('v6');
    });

    it('returns undefined for unknown item types', () => {
      const unknownItem = {
        type: 'unknown',
      } as unknown as RunQueueItem;

      const result = queueMethods.getRunQueueItemTargetVatId(unknownItem);

      expect(result).toBeUndefined();
    });
  });
});
