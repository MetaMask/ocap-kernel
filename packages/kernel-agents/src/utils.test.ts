import '@ocap/repo-tools/test-utils/mock-endoify';

import { describe, it, expect, vi } from 'vitest';

import { makeTestStream } from './test-utils.ts';
import {
  gatherStreamingResponse,
  ifDefined,
  withAbort,
  withRetries,
} from './utils.ts';

describe('ifDefined', () => {
  it('removes undefined values', () => {
    expect(ifDefined({ a: 1, b: undefined, c: 3 })).toStrictEqual({
      a: 1,
      c: 3,
    });
  });
});

describe('withAbort', () => {
  it('calls abort on success', async () => {
    const abort = vi.fn();
    const func = vi.fn();
    await withAbort(abort, func);
    expect(abort).toHaveBeenCalled();
  });

  it('calls abort on error', async () => {
    const abort = vi.fn();
    const func = vi.fn().mockRejectedValue(new Error('test'));
    await expect(withAbort(abort, func)).rejects.toThrow('test');
    expect(abort).toHaveBeenCalled();
  });
});

const makeTestParser = (chunks: string[], finishOn: number) => {
  let count = 0;
  return (_: string) => {
    count += 1;
    if (count >= finishOn) {
      return JSON.parse(chunks.slice(0, count).join(''));
    }
    return null;
  };
};

describe('gatherStreamingResponse', () => {
  const asResponse = (response: string) => ({ response });

  const prepareStreamAndParse = (chunks: string[], finishOn: number) => {
    const { stream } = makeTestStream(chunks, asResponse);
    const parse = makeTestParser(chunks, finishOn);
    return { stream, parse };
  };

  it('gathers complete response from single chunk', async () => {
    const chunks = ['{"key": "value"}'];
    const { stream, parse } = prepareStreamAndParse(chunks, 1);
    const result = await gatherStreamingResponse({ stream, parse });
    expect(result).toStrictEqual({ key: 'value' });
  });

  it('gathers response from multiple chunks', async () => {
    const chunks = ['{"key": "val', 'ue", "content": 42}'];
    const { stream, parse } = prepareStreamAndParse(chunks, 2);
    const result = await gatherStreamingResponse({ stream, parse });
    expect(result).toStrictEqual({ key: 'value', content: 42 });
  });

  it('throws error when stream ends without parse event', async () => {
    const chunks = ['incomplete json'];
    const { stream, parse } = prepareStreamAndParse(chunks, 2);
    await expect(gatherStreamingResponse({ stream, parse })).rejects.toThrow(
      'Stream ended without a parse event',
    );
  });
});

describe('withRetries', () => {
  it('retries a function', async () => {
    const func = vi
      .fn()
      .mockRejectedValueOnce(new Error('test'))
      .mockResolvedValueOnce('result');
    const result = await withRetries(func, 2);
    expect(result).toBe('result');
  });

  it('throws an error if the function fails after all retries', async () => {
    const func = vi.fn().mockRejectedValue(new Error('test'));
    await expect(async () => withRetries(func, 2)).rejects.toThrow('test');
  });

  it('throws an error if the function throws an error that is not retryable', async () => {
    const func = vi.fn().mockRejectedValue(new Error('test'));
    await expect(async () => withRetries(func, 2, () => false)).rejects.toThrow(
      'test',
    );
  });
});
