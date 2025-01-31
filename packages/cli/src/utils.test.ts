import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';

import { withTimeout } from './utils.js';

describe('utils', async () => {
  beforeEach(() => {
    vi.useFakeTimers({
      now: Date.now(),
      toFake: ['setTimeout'],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('withTimeout', () => {
    it('times out within the specified duration', async () => {
      const duration = 300;
      const timeout = withTimeout(new Promise(() => undefined), duration);
      vi.advanceTimersByTime(duration);
      await expect(async () => await timeout).rejects.toThrow(/timed out/u);
    });
  });
});
