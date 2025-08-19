import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';

import { makeRefIterator } from './ref-reader.ts';

vi.mock('@endo/far', () => ({
  E: vi.fn((ref) => ref),
}));

describe('ref-reader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const makeMockIteratorRef = (
    props: Partial<{
      next: Mock;
      return: Mock;
      throw: Mock;
    }> = {},
  ) => {
    return {
      next: vi.fn(),
      return: vi.fn(),
      throw: vi.fn(),
      ...props,
    };
  };

  describe('makeRefIterator', () => {
    it('should create a valid async iterator', () => {
      const mockIteratorRef = makeMockIteratorRef();

      const iterator = makeRefIterator(mockIteratorRef);

      expect(iterator).toBeDefined();
      expect(typeof iterator.next).toBe('function');
      expect(typeof iterator.return).toBe('function');
      expect(typeof iterator.throw).toBe('function');
      expect(typeof iterator[Symbol.asyncIterator]).toBe('function');
    });

    it('should handle next() method calls', async () => {
      const mockIteratorRef = makeMockIteratorRef({
        next: vi.fn().mockResolvedValue({ done: false, value: 42 }),
      });

      const iterator = makeRefIterator(mockIteratorRef);
      const result = await iterator.next();

      expect(result).toStrictEqual({ done: false, value: 42 });
      expect(mockIteratorRef.next).toHaveBeenCalledWith();
    });

    it('should handle next() with arguments', async () => {
      const mockIteratorRef = makeMockIteratorRef({
        next: vi.fn().mockResolvedValue({ done: false, value: 'test' }),
      });

      const iterator = makeRefIterator(mockIteratorRef);
      const result = await iterator.next('arg');

      expect(result).toStrictEqual({ done: false, value: 'test' });
      expect(mockIteratorRef.next).toHaveBeenCalledWith('arg');
    });

    it('should handle return() method calls', async () => {
      const mockIteratorRef = makeMockIteratorRef({
        return: vi.fn().mockResolvedValue({ done: true, value: 'returned' }),
      });

      const iterator = makeRefIterator(mockIteratorRef);
      const result = await iterator.return?.('early');

      expect(result).toStrictEqual({ done: true, value: 'returned' });
      expect(mockIteratorRef.return).toHaveBeenCalledWith('early');
    });

    it('should handle throw() method calls', async () => {
      const error = new Error('Test error');
      const mockIteratorRef = makeMockIteratorRef({
        throw: vi.fn().mockResolvedValue({ done: true, value: error }),
      });

      const iterator = makeRefIterator(mockIteratorRef);
      const result = await iterator.throw?.(error);

      expect(result).toStrictEqual({ done: true, value: error });
      expect(mockIteratorRef.throw).toHaveBeenCalledWith(error);
    });

    it('should support Symbol.asyncIterator', () => {
      const mockIteratorRef = makeMockIteratorRef();

      const iterator = makeRefIterator(mockIteratorRef);
      const asyncIterator = iterator[Symbol.asyncIterator]();

      expect(asyncIterator).toBe(iterator);
    });

    it('should handle multiple next() calls', async () => {
      let callCount = 0;
      const mockIteratorRef = makeMockIteratorRef({
        next: vi.fn().mockImplementation(async () => {
          callCount += 1;
          return Promise.resolve({ done: callCount > 2, value: callCount });
        }),
      });

      const iterator = makeRefIterator(mockIteratorRef);

      const result1 = await iterator.next();
      const result2 = await iterator.next();
      const result3 = await iterator.next();

      expect(result1).toStrictEqual({ done: false, value: 1 });
      expect(result2).toStrictEqual({ done: false, value: 2 });
      expect(result3).toStrictEqual({ done: true, value: 3 });
      expect(mockIteratorRef.next).toHaveBeenCalledTimes(3);
    });

    it('should handle empty iterators', async () => {
      const mockIteratorRef = makeMockIteratorRef({
        next: vi.fn().mockResolvedValue({ done: true, value: undefined }),
      });

      const iterator = makeRefIterator(mockIteratorRef);
      const result = await iterator.next();

      expect(result).toStrictEqual({ done: true, value: undefined });
    });

    it('should handle errors in iterator methods', async () => {
      const error = new Error('Iterator error');
      const mockIteratorRef = makeMockIteratorRef({
        next: vi.fn().mockRejectedValue(error),
        return: vi.fn().mockRejectedValue(error),
        throw: vi.fn().mockRejectedValue(error),
      });

      const iterator = makeRefIterator(mockIteratorRef);

      await expect(iterator.next()).rejects.toThrow('Iterator error');
      await expect(iterator.return?.()).rejects.toThrow('Iterator error');
      await expect(iterator.throw?.(error)).rejects.toThrow('Iterator error');
    });

    it('should handle different value types', async () => {
      const complexValue = {
        id: 1,
        data: ['a', 'b'],
        metadata: { timestamp: Date.now() },
      };
      const mockIteratorRef = makeMockIteratorRef({
        next: vi
          .fn()
          .mockResolvedValueOnce({ done: false, value: 'string' })
          .mockResolvedValueOnce({ done: false, value: 42 })
          .mockResolvedValueOnce({ done: false, value: true })
          .mockResolvedValueOnce({ done: false, value: null })
          .mockResolvedValueOnce({ done: false, value: complexValue }),
      });

      const iterator = makeRefIterator(mockIteratorRef);

      const results = await Promise.all([
        iterator.next(),
        iterator.next(),
        iterator.next(),
        iterator.next(),
        iterator.next(),
      ]);

      expect(results[0]).toStrictEqual({ done: false, value: 'string' });
      expect(results[1]).toStrictEqual({ done: false, value: 42 });
      expect(results[2]).toStrictEqual({ done: false, value: true });
      expect(results[3]).toStrictEqual({ done: false, value: null });
      expect(results[4]).toStrictEqual({ done: false, value: complexValue });
    });
  });
});
