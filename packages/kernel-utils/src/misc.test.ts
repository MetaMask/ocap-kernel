import { AbortError } from '@metamask/kernel-errors';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { abortableDelay, delay, makeCounter } from './misc.ts';

describe('misc utilities', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('makeCounter', () => {
    it('starts at 1 by default', () => {
      const counter = makeCounter();
      expect(counter()).toBe(1);
    });

    it('starts counting from the supplied argument', () => {
      const start = 50;
      const counter = makeCounter(start);
      expect(counter()).toStrictEqual(start + 1);
    });

    it('increments convincingly', () => {
      const counter = makeCounter();
      const first = counter();
      expect(counter()).toStrictEqual(first + 1);
      expect(counter()).toStrictEqual(first + 2);
      expect(counter()).toStrictEqual(first + 3);
    });
  });

  describe('delay', () => {
    it('delays execution by the specified number of milliseconds', async () => {
      const delayTime = 100;
      const delayP = delay(delayTime);
      vi.advanceTimersByTime(delayTime);
      expect(await delayP).toBeUndefined();
    });

    it('delays execution by the default number of milliseconds', async () => {
      const delayP = delay();
      vi.advanceTimersByTime(1);
      expect(await delayP).toBeUndefined();
    });
  });

  describe('abortableDelay', () => {
    it('delays execution by the specified number of milliseconds', async () => {
      const delayTime = 100;
      const delayP = abortableDelay(delayTime);
      vi.advanceTimersByTime(delayTime);
      expect(await delayP).toBeUndefined();
    });

    it('returns immediately when ms is 0', async () => {
      const result = await abortableDelay(0);
      expect(result).toBeUndefined();
    });

    it('returns immediately when ms is negative', async () => {
      const result = await abortableDelay(-100);
      expect(result).toBeUndefined();
    });

    it('throws AbortError when signal is already aborted', async () => {
      const controller = new AbortController();
      controller.abort();
      await expect(abortableDelay(100, controller.signal)).rejects.toThrow(
        AbortError,
      );
      await expect(abortableDelay(100, controller.signal)).rejects.toThrow(
        'Operation aborted.',
      );
    });

    it('throws AbortError when signal is aborted during delay', async () => {
      const controller = new AbortController();
      const delayP = abortableDelay(1000, controller.signal);
      vi.advanceTimersByTime(50);
      controller.abort();
      await expect(delayP).rejects.toThrow(AbortError);
      await expect(delayP).rejects.toThrow('Operation aborted.');
    });

    it('clears timeout when aborted', async () => {
      const controller = new AbortController();
      const delayP = abortableDelay(1000, controller.signal);
      controller.abort();
      await expect(delayP).rejects.toThrow(AbortError);
      vi.advanceTimersByTime(2000);
      await expect(delayP).rejects.toThrow(AbortError);
    });

    it('works without signal parameter', async () => {
      const delayP = abortableDelay(100);
      vi.advanceTimersByTime(100);
      expect(await delayP).toBeUndefined();
    });

    it('completes normally if signal is provided but not aborted', async () => {
      const controller = new AbortController();
      const delayP = abortableDelay(100, controller.signal);
      vi.advanceTimersByTime(100);
      expect(await delayP).toBeUndefined();
    });

    it.each([
      { name: 'very short delay', ms: 1 },
      { name: 'short delay', ms: 10 },
      { name: 'medium delay', ms: 500 },
      { name: 'long delay', ms: 5000 },
    ])('handles $name correctly', async ({ ms }) => {
      const delayP = abortableDelay(ms);
      vi.advanceTimersByTime(ms);
      expect(await delayP).toBeUndefined();
    });

    it('works in real-time environment', async () => {
      vi.useRealTimers();
      const start = Date.now();
      await abortableDelay(50);
      const elapsed = Date.now() - start;
      // Should have delayed approximately 50ms (with some tolerance)
      expect(elapsed).toBeGreaterThanOrEqual(45);
      expect(elapsed).toBeLessThan(100);
    });

    it('can be aborted in real-time environment', async () => {
      vi.useRealTimers();
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 10);
      await expect(abortableDelay(1000, controller.signal)).rejects.toThrow(
        AbortError,
      );
    });
  });
});
