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

  it('invokes onRetry with jitter-computed delay', async () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);

    let attempts = 0;
    const op = vi.fn(async () => {
      attempts += 1;
      if (attempts < 3) {
        throw new Error('fail');
      }
      return 'ok';
    });

    const onRetry = vi.fn();

    const promise = retryWithBackoff(op, {
      maxAttempts: 5,
      baseDelayMs: 100,
      maxDelayMs: 1_000,
      jitter: true,
      onRetry,
    });

    // After first failure: attemptIndex 0 → delay = base (100)
    await Promise.resolve();
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenLastCalledWith(
      expect.objectContaining({ attempt: 2, delayMs: 100 }),
    );

    await vi.advanceTimersByTimeAsync(100);
    await Promise.resolve();

    // After second failure: attemptIndex 1 → jittered delay = 150 (with random=0.5)
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenLastCalledWith(
      expect.objectContaining({ attempt: 3, delayMs: 150 }),
    );

    await vi.advanceTimersByTimeAsync(150);
    const result = await promise;
    expect(result).toBe('ok');

    randomSpy.mockRestore();
    vi.useRealTimers();
  });

  it('computes exponential backoff without jitter', async () => {
    vi.useFakeTimers();
    let attempts = 0;
    const op = vi.fn(async () => {
      attempts += 1;
      if (attempts < 3) {
        throw new Error('f');
      }
      return 'ok';
    });

    const onRetry = vi.fn();
    const promise = retryWithBackoff(op, {
      maxAttempts: 5,
      baseDelayMs: 100,
      maxDelayMs: 1_000,
      jitter: false,
      onRetry,
    });

    // After first failure: attemptIndex 0 → delay = 100
    await Promise.resolve();
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenLastCalledWith(
      expect.objectContaining({ attempt: 2, delayMs: 100 }),
    );
    await vi.advanceTimersByTimeAsync(100);
    await Promise.resolve();

    // After second failure: attemptIndex 1 → delay = 200
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenLastCalledWith(
      expect.objectContaining({ attempt: 3, delayMs: 200 }),
    );
    await vi.advanceTimersByTimeAsync(200);
    const result = await promise;
    expect(result).toBe('ok');
    vi.useRealTimers();
  });

  it('caps delay by maxDelayMs regardless of base growth', async () => {
    vi.useFakeTimers();
    let attempts = 0;
    const op = vi.fn(async () => {
      attempts += 1;
      if (attempts < 3) {
        throw new Error('f');
      }
      return 'ok';
    });

    const onRetry = vi.fn();
    const promise = retryWithBackoff(op, {
      maxAttempts: 5,
      baseDelayMs: 150,
      maxDelayMs: 100,
      jitter: true,
      onRetry,
    });

    await Promise.resolve();
    // With cap < base, delay should be capped to maxDelayMs
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenLastCalledWith(
      expect.objectContaining({ attempt: 2, delayMs: 100 }),
    );
    await vi.advanceTimersByTimeAsync(100);
    await Promise.resolve();

    // Next attempt also remains capped
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenLastCalledWith(
      expect.objectContaining({ attempt: 3, delayMs: 100 }),
    );
    await vi.advanceTimersByTimeAsync(100);
    const result = await promise;
    expect(result).toBe('ok');
    vi.useRealTimers();
  });

  it('uses default options and throws after default maxAttempts', async () => {
    vi.useFakeTimers();
    const op = vi.fn(async () => {
      throw new Error('fail all');
    });

    const promise = retryWithBackoff(op); // no options passed -> use defaults
    promise.catch(() => {
      // prevent unhandled Error
    });
    await vi.runAllTimersAsync();
    await expect(promise).rejects.toThrow('fail all');
    expect(op).toHaveBeenCalledTimes(5); // default maxAttempts
    vi.useRealTimers();
  });

  it('throws generic error when last thrown value is not an Error', async () => {
    vi.useFakeTimers();
    const op = vi.fn(async () => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw 'nope';
    });

    const promise = retryWithBackoff(op, {
      maxAttempts: 2,
      baseDelayMs: 10,
      maxDelayMs: 10,
      jitter: false,
    });
    promise.catch(() => {
      // prevent unhandled Error
    });
    await vi.runAllTimersAsync();
    await expect(promise).rejects.toThrow('Retry operation failed');
    vi.useRealTimers();
  });
});
