import { ResourceLimitError } from '@metamask/kernel-errors';
import { describe, it, expect, beforeEach } from 'vitest';

import {
  DEFAULT_CONNECTION_RATE_LIMIT,
  DEFAULT_CONNECTION_RATE_WINDOW_MS,
  DEFAULT_MESSAGE_RATE_LIMIT,
  DEFAULT_MESSAGE_RATE_WINDOW_MS,
} from './constants.ts';
import {
  SlidingWindowRateLimiter,
  makeMessageRateLimiter,
  makeConnectionRateLimiter,
} from './rate-limiter.ts';

describe('SlidingWindowRateLimiter', () => {
  let limiter: SlidingWindowRateLimiter;

  beforeEach(() => {
    // Create a limiter allowing 3 events per 100ms window for faster tests
    limiter = new SlidingWindowRateLimiter(3, 100);
  });

  describe('wouldExceedLimit', () => {
    it('returns false when no events recorded', () => {
      expect(limiter.wouldExceedLimit('peer1')).toBe(false);
    });

    it('returns false when under the limit', () => {
      limiter.recordEvent('peer1');
      limiter.recordEvent('peer1');
      expect(limiter.wouldExceedLimit('peer1')).toBe(false);
    });

    it('returns true when at the limit', () => {
      limiter.recordEvent('peer1');
      limiter.recordEvent('peer1');
      limiter.recordEvent('peer1');
      expect(limiter.wouldExceedLimit('peer1')).toBe(true);
    });

    it('tracks limits independently per key', () => {
      limiter.recordEvent('peer1');
      limiter.recordEvent('peer1');
      limiter.recordEvent('peer1');
      expect(limiter.wouldExceedLimit('peer1')).toBe(true);
      expect(limiter.wouldExceedLimit('peer2')).toBe(false);
    });

    it('allows events after window expires', async () => {
      limiter.recordEvent('peer1');
      limiter.recordEvent('peer1');
      limiter.recordEvent('peer1');
      expect(limiter.wouldExceedLimit('peer1')).toBe(true);

      // Wait for window to expire
      await new Promise((resolve) => setTimeout(resolve, 110));
      expect(limiter.wouldExceedLimit('peer1')).toBe(false);
    });
  });

  describe('recordEvent', () => {
    it('records events for a key', () => {
      limiter.recordEvent('peer1');
      expect(limiter.getCurrentCount('peer1')).toBe(1);
    });

    it('accumulates events', () => {
      limiter.recordEvent('peer1');
      limiter.recordEvent('peer1');
      expect(limiter.getCurrentCount('peer1')).toBe(2);
    });

    it('prunes old events when recording', async () => {
      limiter.recordEvent('peer1');
      limiter.recordEvent('peer1');
      await new Promise((resolve) => setTimeout(resolve, 110));
      limiter.recordEvent('peer1');
      expect(limiter.getCurrentCount('peer1')).toBe(1);
    });
  });

  describe('checkAndRecord', () => {
    it('records event when under limit', () => {
      limiter.checkAndRecord('peer1', 'messageRate');
      expect(limiter.getCurrentCount('peer1')).toBe(1);
    });

    it('throws ResourceLimitError when limit exceeded', () => {
      limiter.recordEvent('peer1');
      limiter.recordEvent('peer1');
      limiter.recordEvent('peer1');

      expect(() => limiter.checkAndRecord('peer1', 'messageRate')).toThrow(
        ResourceLimitError,
      );
    });

    it('includes limit details in error', () => {
      limiter.recordEvent('peer1');
      limiter.recordEvent('peer1');
      limiter.recordEvent('peer1');

      let caughtError: ResourceLimitError | undefined;
      try {
        limiter.checkAndRecord('peer1', 'messageRate');
      } catch (error) {
        caughtError = error as ResourceLimitError;
      }

      expect(caughtError).toBeInstanceOf(ResourceLimitError);
      expect(caughtError?.data).toStrictEqual({
        limitType: 'messageRate',
        current: 3,
        limit: 3,
      });
    });

    it('does not record when limit exceeded', () => {
      limiter.recordEvent('peer1');
      limiter.recordEvent('peer1');
      limiter.recordEvent('peer1');

      try {
        limiter.checkAndRecord('peer1', 'messageRate');
      } catch {
        // Expected
      }

      expect(limiter.getCurrentCount('peer1')).toBe(3);
    });
  });

  describe('getCurrentCount', () => {
    it('returns 0 for unknown key', () => {
      expect(limiter.getCurrentCount('unknown')).toBe(0);
    });

    it('returns count of events within window', () => {
      limiter.recordEvent('peer1');
      limiter.recordEvent('peer1');
      expect(limiter.getCurrentCount('peer1')).toBe(2);
    });

    it('excludes events outside window', async () => {
      limiter.recordEvent('peer1');
      await new Promise((resolve) => setTimeout(resolve, 60));
      limiter.recordEvent('peer1');
      await new Promise((resolve) => setTimeout(resolve, 50));
      // First event is now outside window (110ms ago)
      expect(limiter.getCurrentCount('peer1')).toBe(1);
    });
  });

  describe('clearKey', () => {
    it('removes all events for a key', () => {
      limiter.recordEvent('peer1');
      limiter.recordEvent('peer1');
      limiter.clearKey('peer1');
      expect(limiter.getCurrentCount('peer1')).toBe(0);
    });

    it('does not affect other keys', () => {
      limiter.recordEvent('peer1');
      limiter.recordEvent('peer2');
      limiter.clearKey('peer1');
      expect(limiter.getCurrentCount('peer1')).toBe(0);
      expect(limiter.getCurrentCount('peer2')).toBe(1);
    });
  });

  describe('clear', () => {
    it('removes all events for all keys', () => {
      limiter.recordEvent('peer1');
      limiter.recordEvent('peer2');
      limiter.clear();
      expect(limiter.getCurrentCount('peer1')).toBe(0);
      expect(limiter.getCurrentCount('peer2')).toBe(0);
    });
  });

  describe('pruneStale', () => {
    it('removes keys with no recent events', async () => {
      limiter.recordEvent('peer1');
      await new Promise((resolve) => setTimeout(resolve, 110));
      limiter.pruneStale();
      expect(limiter.getCurrentCount('peer1')).toBe(0);
    });

    it('keeps keys with recent events', () => {
      limiter.recordEvent('peer1');
      limiter.pruneStale();
      expect(limiter.getCurrentCount('peer1')).toBe(1);
    });

    it('prunes old events from active keys', async () => {
      limiter.recordEvent('peer1');
      await new Promise((resolve) => setTimeout(resolve, 60));
      limiter.recordEvent('peer1');
      await new Promise((resolve) => setTimeout(resolve, 50));
      limiter.pruneStale();
      // Only the second event should remain (first is >100ms old)
      expect(limiter.getCurrentCount('peer1')).toBe(1);
    });
  });

  describe('sliding window behavior', () => {
    it('allows burst followed by sustained rate', async () => {
      // Burst 3 events
      limiter.checkAndRecord('peer1', 'messageRate');
      limiter.checkAndRecord('peer1', 'messageRate');
      limiter.checkAndRecord('peer1', 'messageRate');

      // Should be at limit
      expect(limiter.wouldExceedLimit('peer1')).toBe(true);

      // Wait for first event to expire
      await new Promise((resolve) => setTimeout(resolve, 110));

      // Now slots available
      expect(limiter.wouldExceedLimit('peer1')).toBe(false);
      limiter.checkAndRecord('peer1', 'messageRate');
      expect(limiter.getCurrentCount('peer1')).toBe(1);
    });
  });
});

describe('makeMessageRateLimiter', () => {
  it('creates limiter with default settings', () => {
    const limiter = makeMessageRateLimiter();

    // Should allow DEFAULT_MESSAGE_RATE_LIMIT events
    for (let idx = 0; idx < DEFAULT_MESSAGE_RATE_LIMIT; idx++) {
      limiter.recordEvent('peer1');
    }
    expect(limiter.wouldExceedLimit('peer1')).toBe(true);
  });

  it('creates limiter with custom rate', () => {
    const limiter = makeMessageRateLimiter(5);

    for (let idx = 0; idx < 5; idx++) {
      limiter.recordEvent('peer1');
    }
    expect(limiter.wouldExceedLimit('peer1')).toBe(true);
  });

  it('uses 1 second window', async () => {
    // Use a small limit to make test faster
    const limiter = makeMessageRateLimiter(2);

    limiter.recordEvent('peer1');
    limiter.recordEvent('peer1');
    expect(limiter.wouldExceedLimit('peer1')).toBe(true);

    // Window is 1 second, so after 1 second events should be allowed
    await new Promise((resolve) =>
      setTimeout(resolve, DEFAULT_MESSAGE_RATE_WINDOW_MS + 10),
    );
    expect(limiter.wouldExceedLimit('peer1')).toBe(false);
  });
});

describe('makeConnectionRateLimiter', () => {
  it('creates limiter with default settings', () => {
    const limiter = makeConnectionRateLimiter();

    // Should allow DEFAULT_CONNECTION_RATE_LIMIT events
    for (let idx = 0; idx < DEFAULT_CONNECTION_RATE_LIMIT; idx++) {
      limiter.recordEvent('peer1');
    }
    expect(limiter.wouldExceedLimit('peer1')).toBe(true);
  });

  it('creates limiter with custom rate', () => {
    const limiter = makeConnectionRateLimiter(3);

    for (let idx = 0; idx < 3; idx++) {
      limiter.recordEvent('peer1');
    }
    expect(limiter.wouldExceedLimit('peer1')).toBe(true);
  });

  // Skip window expiration test for connection limiter as it would take 60 seconds
});

describe('constants', () => {
  it('exports expected default values', () => {
    expect(DEFAULT_MESSAGE_RATE_LIMIT).toBe(100);
    expect(DEFAULT_MESSAGE_RATE_WINDOW_MS).toBe(1000);
    expect(DEFAULT_CONNECTION_RATE_LIMIT).toBe(10);
    expect(DEFAULT_CONNECTION_RATE_WINDOW_MS).toBe(60_000);
  });
});
