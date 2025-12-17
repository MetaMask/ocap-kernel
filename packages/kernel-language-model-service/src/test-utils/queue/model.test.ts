import '@ocap/repo-tools/test-utils/mock-endoify';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { makeQueueModel } from './model.ts';
import type { ResponseFormatter } from './response.ts';
import type { Tokenizer } from './tokenizer.ts';
import type { StreamWithAbort } from './utils.ts';
import * as utils from './utils.ts';

vi.mock('./utils.ts', () => ({
  makeAbortableAsyncIterable: vi.fn(),
  makeEmptyStreamWithAbort: vi.fn(),
  mapAsyncIterable: vi.fn(),
  normalizeToAsyncIterable: vi.fn(),
}));

describe('makeQueueModel', () => {
  let mockTokenizer: ReturnType<typeof vi.fn<Tokenizer>>;
  let mockResponseFormatter: ReturnType<
    typeof vi.fn<ResponseFormatter<{ response: string; done: boolean }>>
  >;
  let mockMakeAbortableAsyncIterable: ReturnType<typeof vi.fn>;
  let mockMakeEmptyStreamWithAbort: ReturnType<typeof vi.fn>;
  let mockMapAsyncIterable: ReturnType<typeof vi.fn>;
  let mockNormalizeToAsyncIterable: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockTokenizer = vi.fn<Tokenizer>();
    mockResponseFormatter =
      vi.fn<ResponseFormatter<{ response: string; done: boolean }>>();
    mockMakeAbortableAsyncIterable = vi.mocked(
      utils.makeAbortableAsyncIterable,
    );
    mockMakeEmptyStreamWithAbort = vi.mocked(utils.makeEmptyStreamWithAbort);
    mockMapAsyncIterable = vi.mocked(utils.mapAsyncIterable);
    mockNormalizeToAsyncIterable = vi.mocked(utils.normalizeToAsyncIterable);
  });

  it('creates model with default parameters', () => {
    const model = makeQueueModel();
    expect(model).toMatchObject({
      getInfo: expect.any(Function),
      load: expect.any(Function),
      unload: expect.any(Function),
      sample: expect.any(Function),
      push: expect.any(Function),
    });
  });

  it('creates model with custom tokenizer', () => {
    const model = makeQueueModel({ tokenizer: mockTokenizer });
    expect(model).toBeDefined();
  });

  it('creates model with custom responseFormatter', () => {
    const model = makeQueueModel({ responseFormatter: mockResponseFormatter });
    expect(model).toBeDefined();
  });

  it('creates model with custom responseQueue', () => {
    const mockStream: StreamWithAbort<{ response: string; done: boolean }> = {
      stream: (async function* () {
        // Empty stream for testing
      })() as AsyncIterable<{
        response: string;
        done: boolean;
      }>,
      abort: vi.fn<() => Promise<void>>(),
    };
    const responseQueue = [mockStream];
    const model = makeQueueModel({ responseQueue });
    expect(model).toBeDefined();
  });

  describe('getInfo', () => {
    it('returns model info', async () => {
      const model = makeQueueModel();
      const info = await model.getInfo();
      expect(info).toStrictEqual({ model: 'test' });
    });
  });

  describe('load', () => {
    it('resolves without error', async () => {
      const model = makeQueueModel();
      expect(await model.load()).toBeUndefined();
    });
  });

  describe('unload', () => {
    it('resolves without error', async () => {
      const model = makeQueueModel();
      expect(await model.unload()).toBeUndefined();
    });
  });

  describe('sample', () => {
    it('returns stream from queue when available', async () => {
      const mockStream: StreamWithAbort<{ response: string; done: boolean }> = {
        stream: (async function* () {
          yield { response: 'test', done: false };
        })(),
        abort: vi.fn<() => Promise<void>>(),
      };
      const responseQueue = [mockStream];
      const model = makeQueueModel({ responseQueue });

      const result = await model.sample('');
      const values: { response: string; done: boolean }[] = [];
      for await (const value of result.stream) {
        values.push(value);
      }

      expect(values).toStrictEqual([{ response: 'test', done: false }]);
      expect(responseQueue).toHaveLength(0);
    });

    it('returns empty stream when queue is empty', async () => {
      const emptyStream: StreamWithAbort<{ response: string; done: boolean }> =
        {
          stream: (async function* () {
            // Empty stream for testing
          })() as AsyncIterable<{
            response: string;
            done: boolean;
          }>,
          abort: vi.fn<() => Promise<void>>(),
        };
      mockMakeEmptyStreamWithAbort.mockReturnValue(emptyStream);

      const model = makeQueueModel();
      const result = await model.sample('');

      expect(mockMakeEmptyStreamWithAbort).toHaveBeenCalledTimes(1);
      expect(result).toBe(emptyStream);
    });
  });

  describe('push', () => {
    it('pushes stream to queue', () => {
      const responseQueue: StreamWithAbort<{
        response: string;
        done: boolean;
      }>[] = [];
      const mockStream: StreamWithAbort<{ response: string; done: boolean }> = {
        stream: (async function* () {
          // Empty stream for testing
        })() as AsyncIterable<{
          response: string;
          done: boolean;
        }>,
        abort: vi.fn<() => Promise<void>>(),
      };

      mockTokenizer.mockReturnValue(['token1', 'token2']);
      mockNormalizeToAsyncIterable.mockReturnValue(
        (async function* () {
          yield 'token1';
          yield 'token2';
        })(),
      );
      mockMapAsyncIterable.mockReturnValue(
        (async function* () {
          yield { response: 'token1', done: false };
          yield { response: 'token2', done: true };
        })(),
      );
      mockMakeAbortableAsyncIterable.mockReturnValue(mockStream);

      const model = makeQueueModel({
        tokenizer: mockTokenizer,
        responseFormatter: mockResponseFormatter,
        responseQueue,
      });

      model.push('test text');

      expect(mockTokenizer).toHaveBeenCalledWith('test text');
      expect(mockNormalizeToAsyncIterable).toHaveBeenCalledWith([
        'token1',
        'token2',
      ]);
      expect(mockMapAsyncIterable).toHaveBeenCalledWith(
        expect.anything(),
        mockResponseFormatter,
      );
      expect(mockMakeAbortableAsyncIterable).toHaveBeenCalledTimes(1);
      expect(responseQueue).toHaveLength(1);
      expect(responseQueue[0]).toBe(mockStream);
    });

    it('pushes multiple streams to queue', () => {
      const responseQueue: StreamWithAbort<{
        response: string;
        done: boolean;
      }>[] = [];
      const mockStream1: StreamWithAbort<{ response: string; done: boolean }> =
        {
          stream: (async function* () {
            // Empty stream for testing
          })() as AsyncIterable<{
            response: string;
            done: boolean;
          }>,
          abort: vi.fn<() => Promise<void>>(),
        };
      const mockStream2: StreamWithAbort<{ response: string; done: boolean }> =
        {
          stream: (async function* () {
            // Empty stream for testing
          })() as AsyncIterable<{
            response: string;
            done: boolean;
          }>,
          abort: vi.fn<() => Promise<void>>(),
        };

      mockTokenizer.mockReturnValue(['token']);
      mockNormalizeToAsyncIterable.mockReturnValue(
        (async function* () {
          yield 'token';
        })(),
      );
      mockMapAsyncIterable.mockReturnValue(
        (async function* () {
          yield { response: 'token', done: true };
        })(),
      );
      mockMakeAbortableAsyncIterable
        .mockReturnValueOnce(mockStream1)
        .mockReturnValueOnce(mockStream2);

      const model = makeQueueModel({
        tokenizer: mockTokenizer,
        responseFormatter: mockResponseFormatter,
        responseQueue,
      });

      model.push('text1');
      model.push('text2');

      expect(responseQueue).toHaveLength(2);
      expect(responseQueue[0]).toBe(mockStream1);
      expect(responseQueue[1]).toBe(mockStream2);
    });

    it('handles async iterable tokenizer', () => {
      const responseQueue: StreamWithAbort<{
        response: string;
        done: boolean;
      }>[] = [];
      const mockStream: StreamWithAbort<{ response: string; done: boolean }> = {
        stream: (async function* () {
          // Empty stream for testing
        })() as AsyncIterable<{
          response: string;
          done: boolean;
        }>,
        abort: vi.fn<() => Promise<void>>(),
      };

      const asyncIterable = (async function* () {
        yield 'async';
        yield 'token';
      })();
      mockTokenizer.mockReturnValue(asyncIterable);
      mockNormalizeToAsyncIterable.mockReturnValue(asyncIterable);
      mockMapAsyncIterable.mockReturnValue(
        (async function* () {
          yield { response: 'async', done: false };
          yield { response: 'token', done: true };
        })(),
      );
      mockMakeAbortableAsyncIterable.mockReturnValue(mockStream);

      const model = makeQueueModel({
        tokenizer: mockTokenizer,
        responseFormatter: mockResponseFormatter,
        responseQueue,
      });

      model.push('test');

      expect(mockTokenizer).toHaveBeenCalledWith('test');
      expect(mockNormalizeToAsyncIterable).toHaveBeenCalledWith(asyncIterable);
    });
  });

  describe('integration', () => {
    it('pushes and samples from queue in order', async () => {
      const responseQueue: StreamWithAbort<{
        response: string;
        done: boolean;
      }>[] = [];
      const mockStream1: StreamWithAbort<{ response: string; done: boolean }> =
        {
          stream: (async function* () {
            yield { response: 'first', done: false };
            yield { response: ' stream', done: true };
          })(),
          abort: vi.fn<() => Promise<void>>(),
        };
      const mockStream2: StreamWithAbort<{ response: string; done: boolean }> =
        {
          stream: (async function* () {
            yield { response: 'second', done: false };
            yield { response: ' stream', done: true };
          })(),
          abort: vi.fn<() => Promise<void>>(),
        };

      mockTokenizer.mockReturnValue(['token']);
      mockNormalizeToAsyncIterable.mockReturnValue(
        (async function* () {
          yield 'token';
        })(),
      );
      mockMapAsyncIterable.mockReturnValue(
        (async function* () {
          yield { response: 'token', done: true };
        })(),
      );
      mockMakeAbortableAsyncIterable
        .mockReturnValueOnce(mockStream1)
        .mockReturnValueOnce(mockStream2);

      const model = makeQueueModel({
        tokenizer: mockTokenizer,
        responseFormatter: mockResponseFormatter,
        responseQueue,
      });

      model.push('first');
      model.push('second');

      const [result1, result2] = await Promise.all([
        model.sample(''),
        model.sample(''),
      ]);

      const [values1, values2] = await Promise.all([
        (async () => {
          const values: { response: string; done: boolean }[] = [];
          for await (const value of result1.stream) {
            values.push(value);
          }
          return values;
        })(),
        (async () => {
          const values: { response: string; done: boolean }[] = [];
          for await (const value of result2.stream) {
            values.push(value);
          }
          return values;
        })(),
      ]);

      expect(values1).toStrictEqual([
        { response: 'first', done: false },
        { response: ' stream', done: true },
      ]);
      expect(values2).toStrictEqual([
        { response: 'second', done: false },
        { response: ' stream', done: true },
      ]);
      expect(responseQueue).toHaveLength(0);
    });
  });
});
