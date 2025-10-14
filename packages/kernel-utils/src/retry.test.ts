import { describe, it, expect, vi } from 'vitest';

import { retryWithBackoff } from './retry.ts';

describe('retryWithBackoff', () => {
  it('resolves on first attempt with no delay', async () => {
    vi.useFakeTimers();
    const op = vi.fn(async () => 'ok');
    const result = await retryWithBackoff(op, {
      maxAttempts: 3,
      baseDelayMs: 100,
      maxDelayMs: 100,
      jitter: false,
    });
    expect(result).toBe('ok');
    expect(op).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('retries and succeeds on third attempt', async () => {
    vi.useFakeTimers();
    let attempts = 0;
    const op = vi.fn(async () => {
      attempts += 1;
      if (attempts < 3) {
        throw new Error(`fail-${attempts}`);
      }
      return 'done';
    });

    const promise = retryWithBackoff(op, {
      maxAttempts: 5,
      baseDelayMs: 100,
      maxDelayMs: 100,
      jitter: false,
    });

    // First failure schedules a delay
    await Promise.resolve();
    expect(op).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(100);
    await Promise.resolve();
    expect(op).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(100);

    const result = await promise;
    expect(result).toBe('done');
    expect(op).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it('respects shouldRetry and stops early', async () => {
    vi.useFakeTimers();
    const op = vi.fn(async () => {
      throw new Error('fatal');
    });

    await expect(
      retryWithBackoff(op, {
        maxAttempts: 5,
        baseDelayMs: 50,
        maxDelayMs: 50,
        jitter: false,
        shouldRetry: () => false,
      }),
    ).rejects.toThrow('fatal');
    expect(op).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
