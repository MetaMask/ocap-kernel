import { describe, it, expect, vi } from 'vitest';

import { createDefaultEndowments } from './endowments.ts';

describe('createDefaultEndowments', () => {
  it('produces the expected global names', () => {
    const { globals } = createDefaultEndowments();
    expect(Object.keys(globals).sort()).toStrictEqual([
      'AbortController',
      'AbortSignal',
      'Date',
      'Math',
      'SubtleCrypto',
      'TextDecoder',
      'TextEncoder',
      'URL',
      'URLSearchParams',
      'atob',
      'btoa',
      'clearInterval',
      'clearTimeout',
      'crypto',
      'setInterval',
      'setTimeout',
    ]);
  });

  it('does not leak teardownFunction into globals', () => {
    const { globals } = createDefaultEndowments();
    expect(Object.keys(globals)).not.toContain('teardownFunction');
  });

  it('freezes both the result and the globals record', () => {
    const result = createDefaultEndowments();
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.globals)).toBe(true);
  });

  it('returns isolated instances per call', () => {
    const first = createDefaultEndowments();
    const second = createDefaultEndowments();
    expect(first).not.toBe(second);
    expect(first.globals.setTimeout).not.toBe(second.globals.setTimeout);
  });

  it('teardown resolves without error when no resources are held', async () => {
    const { teardown } = createDefaultEndowments();
    expect(await teardown()).toBeUndefined();
  });

  it('teardown cancels pending timers', async () => {
    vi.useFakeTimers();
    try {
      const { globals, teardown } = createDefaultEndowments();
      const setTimeoutFn = globals.setTimeout as typeof globalThis.setTimeout;
      const callback = vi.fn();
      setTimeoutFn(callback, 10);
      await teardown();
      vi.advanceTimersByTime(100);
      expect(callback).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
