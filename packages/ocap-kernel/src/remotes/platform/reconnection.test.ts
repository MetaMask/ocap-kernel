import * as kernelUtils from '@metamask/kernel-utils';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  ReconnectionManager,
  DEFAULT_CONSECUTIVE_ERROR_THRESHOLD,
  PERMANENT_FAILURE_ERROR_CODES,
} from './reconnection.ts';

// Mock the calculateReconnectionBackoff function
vi.mock('@metamask/kernel-utils', async () => {
  const actual = await vi.importActual<typeof kernelUtils>(
    '@metamask/kernel-utils',
  );
  return {
    ...actual,
    calculateReconnectionBackoff: vi.fn((attempt: number) => {
      // Simple exponential backoff for testing: 100ms * 2^(attempt-1)
      return Math.min(100 * Math.pow(2, attempt - 1), 30000);
    }),
  };
});

describe('ReconnectionManager', () => {
  let manager: ReconnectionManager;

  beforeEach(() => {
    manager = new ReconnectionManager();
    vi.clearAllMocks();
  });

  describe('startReconnection', () => {
    it('starts reconnection for a peer', () => {
      expect(manager.isReconnecting('peer1')).toBe(false);

      manager.startReconnection('peer1');

      expect(manager.isReconnecting('peer1')).toBe(true);
    });

    it('handles multiple peers independently', () => {
      manager.startReconnection('peer1');
      manager.startReconnection('peer2');

      expect(manager.isReconnecting('peer1')).toBe(true);
      expect(manager.isReconnecting('peer2')).toBe(true);
      expect(manager.isReconnecting('peer3')).toBe(false);
    });

    it('is idempotent', () => {
      manager.startReconnection('peer1');
      manager.startReconnection('peer1');

      expect(manager.isReconnecting('peer1')).toBe(true);
    });
  });

  describe('stopReconnection', () => {
    it('stops reconnection for a peer', () => {
      manager.startReconnection('peer1');
      expect(manager.isReconnecting('peer1')).toBe(true);

      manager.stopReconnection('peer1');

      expect(manager.isReconnecting('peer1')).toBe(false);
    });

    it('works on non-reconnecting peer', () => {
      expect(manager.isReconnecting('peer1')).toBe(false);

      manager.stopReconnection('peer1');

      expect(manager.isReconnecting('peer1')).toBe(false);
    });

    it('does not affect other peers', () => {
      manager.startReconnection('peer1');
      manager.startReconnection('peer2');

      manager.stopReconnection('peer1');

      expect(manager.isReconnecting('peer1')).toBe(false);
      expect(manager.isReconnecting('peer2')).toBe(true);
    });
  });

  describe('isReconnecting', () => {
    it('returns false for new peer', () => {
      expect(manager.isReconnecting('newpeer')).toBe(false);
    });

    it('tracks reconnection state correctly', () => {
      expect(manager.isReconnecting('peer1')).toBe(false);

      manager.startReconnection('peer1');
      expect(manager.isReconnecting('peer1')).toBe(true);

      manager.stopReconnection('peer1');
      expect(manager.isReconnecting('peer1')).toBe(false);
    });
  });

  describe('incrementAttempt', () => {
    it('increments attempt count', () => {
      expect(manager.getAttemptCount('peer1')).toBe(0);

      const count1 = manager.incrementAttempt('peer1');
      expect(count1).toBe(1);
      expect(manager.getAttemptCount('peer1')).toBe(1);

      const count2 = manager.incrementAttempt('peer1');
      expect(count2).toBe(2);
      expect(manager.getAttemptCount('peer1')).toBe(2);
    });

    it('tracks attempts per peer independently', () => {
      manager.incrementAttempt('peer1');
      manager.incrementAttempt('peer1');
      manager.incrementAttempt('peer2');

      expect(manager.getAttemptCount('peer1')).toBe(2);
      expect(manager.getAttemptCount('peer2')).toBe(1);
      expect(manager.getAttemptCount('peer3')).toBe(0);
    });

    it('returns the new count', () => {
      expect(manager.incrementAttempt('peer1')).toBe(1);
      expect(manager.incrementAttempt('peer1')).toBe(2);
      expect(manager.incrementAttempt('peer1')).toBe(3);
    });
  });

  describe('decrementAttempt', () => {
    it('decrements attempt count', () => {
      manager.incrementAttempt('peer1');
      manager.incrementAttempt('peer1');
      expect(manager.getAttemptCount('peer1')).toBe(2);

      manager.decrementAttempt('peer1');
      expect(manager.getAttemptCount('peer1')).toBe(1);

      manager.decrementAttempt('peer1');
      expect(manager.getAttemptCount('peer1')).toBe(0);
    });

    it('does not go below zero', () => {
      expect(manager.getAttemptCount('peer1')).toBe(0);

      manager.decrementAttempt('peer1');
      expect(manager.getAttemptCount('peer1')).toBe(0);
    });

    it('handles decrement on new peer without prior state', () => {
      manager.decrementAttempt('newpeer');
      expect(manager.getAttemptCount('newpeer')).toBe(0);
    });

    it('only affects specified peer', () => {
      manager.incrementAttempt('peer1');
      manager.incrementAttempt('peer1');
      manager.incrementAttempt('peer2');

      manager.decrementAttempt('peer1');

      expect(manager.getAttemptCount('peer1')).toBe(1);
      expect(manager.getAttemptCount('peer2')).toBe(1);
    });
  });

  describe('resetBackoff', () => {
    it('resets attempt count to zero', () => {
      manager.incrementAttempt('peer1');
      manager.incrementAttempt('peer1');
      expect(manager.getAttemptCount('peer1')).toBe(2);

      manager.resetBackoff('peer1');

      expect(manager.getAttemptCount('peer1')).toBe(0);
    });

    it('works on peer with no attempts', () => {
      expect(manager.getAttemptCount('peer1')).toBe(0);

      manager.resetBackoff('peer1');

      expect(manager.getAttemptCount('peer1')).toBe(0);
    });

    it('does not affect reconnection state', () => {
      manager.startReconnection('peer1');
      manager.incrementAttempt('peer1');

      manager.resetBackoff('peer1');

      expect(manager.isReconnecting('peer1')).toBe(true);
      expect(manager.getAttemptCount('peer1')).toBe(0);
    });

    it('only resets specified peer', () => {
      manager.incrementAttempt('peer1');
      manager.incrementAttempt('peer2');

      manager.resetBackoff('peer1');

      expect(manager.getAttemptCount('peer1')).toBe(0);
      expect(manager.getAttemptCount('peer2')).toBe(1);
    });

    it('clears error history to prevent false permanent failures', () => {
      // Accumulate some errors
      manager.recordError('peer1', 'ECONNREFUSED');
      manager.recordError('peer1', 'ECONNREFUSED');
      manager.recordError('peer1', 'ECONNREFUSED');
      expect(manager.getErrorHistory('peer1')).toHaveLength(3);

      // Successful communication - should clear error history
      manager.resetBackoff('peer1');

      expect(manager.getErrorHistory('peer1')).toStrictEqual([]);
    });

    it('prevents stale errors from triggering permanent failure after success', () => {
      // Accumulate 4 errors (one short of threshold)
      manager.recordError('peer1', 'ECONNREFUSED');
      manager.recordError('peer1', 'ECONNREFUSED');
      manager.recordError('peer1', 'ECONNREFUSED');
      manager.recordError('peer1', 'ECONNREFUSED');

      // Successful communication
      manager.resetBackoff('peer1');

      // One more error should NOT trigger permanent failure
      // because the history was cleared
      manager.recordError('peer1', 'ECONNREFUSED');

      expect(manager.isPermanentlyFailed('peer1')).toBe(false);
      expect(manager.getErrorHistory('peer1')).toHaveLength(1);
    });
  });

  describe('calculateBackoff', () => {
    it('calculates backoff for current attempt count', () => {
      const { calculateReconnectionBackoff } = vi.mocked(kernelUtils);

      // No attempts yet (attemptCount = 0)
      const backoff0 = manager.calculateBackoff('peer1');
      expect(calculateReconnectionBackoff).toHaveBeenCalledWith(0);
      expect(backoff0).toBe(50); // 100 * 2^(-1) = 50

      // After first increment (attemptCount = 1)
      manager.incrementAttempt('peer1');
      const backoff1 = manager.calculateBackoff('peer1');
      expect(calculateReconnectionBackoff).toHaveBeenCalledWith(1);
      expect(backoff1).toBe(100);

      // After second increment (attemptCount = 2)
      manager.incrementAttempt('peer1');
      const backoff2 = manager.calculateBackoff('peer1');
      expect(calculateReconnectionBackoff).toHaveBeenCalledWith(2);
      expect(backoff2).toBe(200);
    });

    it('calculates independently for different peers', () => {
      manager.incrementAttempt('peer1');
      manager.incrementAttempt('peer1');

      const backoff1 = manager.calculateBackoff('peer1');
      const backoff2 = manager.calculateBackoff('peer2');

      expect(backoff1).toBe(200); // 2nd attempt (attemptCount = 2)
      expect(backoff2).toBe(50); // No attempts yet (attemptCount = 0)
    });

    it('respects backoff after reset', () => {
      manager.incrementAttempt('peer1');
      manager.incrementAttempt('peer1');
      manager.resetBackoff('peer1');

      const backoff = manager.calculateBackoff('peer1');

      expect(backoff).toBe(50); // Back to 0 attempts
    });
  });

  describe('shouldRetry', () => {
    it('returns true for infinite retries (maxAttempts = 0)', () => {
      for (let i = 0; i < 100; i += 1) {
        manager.incrementAttempt('peer1');
      }

      expect(manager.shouldRetry('peer1', 0)).toBe(true);
    });

    it('respects max attempts limit', () => {
      const maxAttempts = 3;

      expect(manager.shouldRetry('peer1', maxAttempts)).toBe(true);

      manager.incrementAttempt('peer1');
      expect(manager.shouldRetry('peer1', maxAttempts)).toBe(true);

      manager.incrementAttempt('peer1');
      expect(manager.shouldRetry('peer1', maxAttempts)).toBe(true);

      manager.incrementAttempt('peer1');
      expect(manager.shouldRetry('peer1', maxAttempts)).toBe(false);
    });

    it('allows retry after reset', () => {
      const maxAttempts = 2;

      manager.incrementAttempt('peer1');
      manager.incrementAttempt('peer1');
      expect(manager.shouldRetry('peer1', maxAttempts)).toBe(false);

      manager.resetBackoff('peer1');

      expect(manager.shouldRetry('peer1', maxAttempts)).toBe(true);
    });

    it('handles different limits per peer', () => {
      manager.incrementAttempt('peer1');
      manager.incrementAttempt('peer1');

      expect(manager.shouldRetry('peer1', 2)).toBe(false);
      expect(manager.shouldRetry('peer1', 3)).toBe(true);
      expect(manager.shouldRetry('peer1', 0)).toBe(true);
    });
  });

  describe('getAttemptCount', () => {
    it('returns 0 for new peer', () => {
      expect(manager.getAttemptCount('newpeer')).toBe(0);
    });

    it('returns current attempt count', () => {
      manager.incrementAttempt('peer1');
      manager.incrementAttempt('peer1');
      manager.incrementAttempt('peer1');

      expect(manager.getAttemptCount('peer1')).toBe(3);
    });

    it('reflects resets', () => {
      manager.incrementAttempt('peer1');
      manager.incrementAttempt('peer1');
      manager.resetBackoff('peer1');

      expect(manager.getAttemptCount('peer1')).toBe(0);
    });
  });

  describe('resetAllBackoffs', () => {
    it('resets attempts for all reconnecting peers', () => {
      // Set up peers with different states
      manager.startReconnection('peer1');
      manager.incrementAttempt('peer1');
      manager.incrementAttempt('peer1');

      manager.startReconnection('peer2');
      manager.incrementAttempt('peer2');

      // peer3 not reconnecting but has attempts
      manager.incrementAttempt('peer3');
      manager.incrementAttempt('peer3');
      manager.stopReconnection('peer3');

      manager.resetAllBackoffs();

      // Only reconnecting peers should be reset
      expect(manager.getAttemptCount('peer1')).toBe(0);
      expect(manager.getAttemptCount('peer2')).toBe(0);
      expect(manager.getAttemptCount('peer3')).toBe(2); // Not reset
    });

    it('does not affect reconnection state', () => {
      manager.startReconnection('peer1');
      manager.incrementAttempt('peer1');

      manager.resetAllBackoffs();

      expect(manager.isReconnecting('peer1')).toBe(true);
      expect(manager.getAttemptCount('peer1')).toBe(0);
    });

    it('handles empty state', () => {
      expect(() => manager.resetAllBackoffs()).not.toThrow();
    });

    it('clears error history for reconnecting peers after wake from sleep', () => {
      // Set up peer with errors during reconnection
      manager.startReconnection('peer1');
      manager.recordError('peer1', 'ECONNREFUSED');
      manager.recordError('peer1', 'ECONNREFUSED');
      manager.recordError('peer1', 'ECONNREFUSED');

      // peer2 not reconnecting, should not be affected
      manager.recordError('peer2', 'ECONNREFUSED');
      manager.recordError('peer2', 'ECONNREFUSED');

      // Simulate wake from sleep
      manager.resetAllBackoffs();

      // Reconnecting peer's error history should be cleared
      expect(manager.getErrorHistory('peer1')).toStrictEqual([]);
      // Non-reconnecting peer's error history should remain
      expect(manager.getErrorHistory('peer2')).toHaveLength(2);
    });

    it('prevents stale errors from triggering permanent failure after wake', () => {
      manager.startReconnection('peer1');
      // Accumulate 4 errors before sleep
      manager.recordError('peer1', 'ECONNREFUSED');
      manager.recordError('peer1', 'ECONNREFUSED');
      manager.recordError('peer1', 'ECONNREFUSED');
      manager.recordError('peer1', 'ECONNREFUSED');

      // Wake from sleep
      manager.resetAllBackoffs();

      // One more error should NOT trigger permanent failure
      manager.recordError('peer1', 'ECONNREFUSED');

      expect(manager.isPermanentlyFailed('peer1')).toBe(false);
    });
  });

  describe('clear', () => {
    it('clears all states', () => {
      manager.startReconnection('peer1');
      manager.incrementAttempt('peer1');
      manager.startReconnection('peer2');
      manager.incrementAttempt('peer2');

      manager.clear();

      expect(manager.isReconnecting('peer1')).toBe(false);
      expect(manager.isReconnecting('peer2')).toBe(false);
      expect(manager.getAttemptCount('peer1')).toBe(0);
      expect(manager.getAttemptCount('peer2')).toBe(0);
    });

    it('allows new operations after clear', () => {
      manager.startReconnection('peer1');
      manager.clear();

      manager.startReconnection('peer1');
      manager.incrementAttempt('peer1');

      expect(manager.isReconnecting('peer1')).toBe(true);
      expect(manager.getAttemptCount('peer1')).toBe(1);
    });

    it('handles empty state', () => {
      expect(() => manager.clear()).not.toThrow();
    });
  });

  describe('clearPeer', () => {
    it('clears state for specific peer', () => {
      manager.startReconnection('peer1');
      manager.incrementAttempt('peer1');
      manager.startReconnection('peer2');
      manager.incrementAttempt('peer2');

      manager.clearPeer('peer1');

      expect(manager.isReconnecting('peer1')).toBe(false);
      expect(manager.getAttemptCount('peer1')).toBe(0);
      expect(manager.isReconnecting('peer2')).toBe(true);
      expect(manager.getAttemptCount('peer2')).toBe(1);
    });

    it('handles non-existent peer', () => {
      expect(() => manager.clearPeer('nonexistent')).not.toThrow();
    });

    it('allows re-adding peer after clear', () => {
      manager.startReconnection('peer1');
      manager.incrementAttempt('peer1');

      manager.clearPeer('peer1');

      manager.startReconnection('peer1');
      expect(manager.isReconnecting('peer1')).toBe(true);
      expect(manager.getAttemptCount('peer1')).toBe(0);
    });
  });

  describe('integration scenarios', () => {
    it('handles typical reconnection flow', () => {
      const peerId = 'peer1';
      const maxAttempts = 3;

      // Start reconnection
      manager.startReconnection(peerId);
      expect(manager.isReconnecting(peerId)).toBe(true);

      // First attempt - increment then calculate backoff
      expect(manager.shouldRetry(peerId, maxAttempts)).toBe(true);
      manager.incrementAttempt(peerId);
      const backoff1 = manager.calculateBackoff(peerId);
      expect(backoff1).toBe(100); // attemptCount = 1

      // Second attempt
      expect(manager.shouldRetry(peerId, maxAttempts)).toBe(true);
      manager.incrementAttempt(peerId);
      const backoff2 = manager.calculateBackoff(peerId);
      expect(backoff2).toBe(200); // attemptCount = 2

      // Third attempt
      expect(manager.shouldRetry(peerId, maxAttempts)).toBe(true);
      manager.incrementAttempt(peerId);
      const backoff3 = manager.calculateBackoff(peerId);
      expect(backoff3).toBe(400); // attemptCount = 3

      // Should not retry after max attempts
      expect(manager.shouldRetry(peerId, maxAttempts)).toBe(false);

      // Successful reconnection - reset and stop
      manager.resetBackoff(peerId);
      manager.stopReconnection(peerId);

      expect(manager.isReconnecting(peerId)).toBe(false);
      expect(manager.getAttemptCount(peerId)).toBe(0);
    });

    it('handles multiple peers with different states', () => {
      // Peer 1: actively reconnecting
      manager.startReconnection('peer1');
      manager.incrementAttempt('peer1');

      // Peer 2: failed and stopped
      manager.startReconnection('peer2');
      manager.incrementAttempt('peer2');
      manager.incrementAttempt('peer2');
      manager.stopReconnection('peer2');

      // Peer 3: new connection
      // (no explicit state)

      expect(manager.isReconnecting('peer1')).toBe(true);
      expect(manager.isReconnecting('peer2')).toBe(false);
      expect(manager.isReconnecting('peer3')).toBe(false);

      expect(manager.getAttemptCount('peer1')).toBe(1);
      expect(manager.getAttemptCount('peer2')).toBe(2);
      expect(manager.getAttemptCount('peer3')).toBe(0);

      // Reset all backoffs (e.g., after wake from sleep)
      manager.resetAllBackoffs();

      expect(manager.getAttemptCount('peer1')).toBe(0); // Reset (reconnecting)
      expect(manager.getAttemptCount('peer2')).toBe(2); // Not reset (not reconnecting)
      expect(manager.getAttemptCount('peer3')).toBe(0); // Still 0
    });

    it('handles rapid state changes', () => {
      const peerId = 'peer1';

      // Rapid start/stop
      manager.startReconnection(peerId);
      manager.stopReconnection(peerId);
      manager.startReconnection(peerId);

      expect(manager.isReconnecting(peerId)).toBe(true);

      // Increment and reset repeatedly
      manager.incrementAttempt(peerId);
      manager.incrementAttempt(peerId);
      manager.resetBackoff(peerId);
      manager.incrementAttempt(peerId);

      expect(manager.getAttemptCount(peerId)).toBe(1);

      // Clear and restart
      manager.clearPeer(peerId);
      manager.startReconnection(peerId);

      expect(manager.isReconnecting(peerId)).toBe(true);
      expect(manager.getAttemptCount(peerId)).toBe(0);
    });

    it('resets attempt count when starting new reconnection after max retries exhausted', () => {
      const peerId = 'peer1';
      const maxAttempts = 3;

      // Start reconnection and exhaust max attempts
      manager.startReconnection(peerId);
      manager.incrementAttempt(peerId);
      manager.incrementAttempt(peerId);
      manager.incrementAttempt(peerId);

      // Max attempts reached
      expect(manager.shouldRetry(peerId, maxAttempts)).toBe(false);
      expect(manager.getAttemptCount(peerId)).toBe(3);

      // Stop reconnection (simulating giving up)
      manager.stopReconnection(peerId);
      expect(manager.isReconnecting(peerId)).toBe(false);
      // Attempt count is still 3 (not reset by stopReconnection)

      // Start a new reconnection session - should reset attempt count
      manager.startReconnection(peerId);
      expect(manager.isReconnecting(peerId)).toBe(true);
      expect(manager.getAttemptCount(peerId)).toBe(0);
      // Should now allow retries again
      expect(manager.shouldRetry(peerId, maxAttempts)).toBe(true);
    });

    it('does not reset attempt count when already reconnecting', () => {
      const peerId = 'peer1';

      // Start reconnection and make some attempts
      manager.startReconnection(peerId);
      manager.incrementAttempt(peerId);
      manager.incrementAttempt(peerId);
      expect(manager.getAttemptCount(peerId)).toBe(2);

      // Calling startReconnection again (idempotent) should not reset
      manager.startReconnection(peerId);
      expect(manager.getAttemptCount(peerId)).toBe(2);
      expect(manager.isReconnecting(peerId)).toBe(true);
    });
  });

  describe('error tracking', () => {
    describe('recordError', () => {
      it('records errors in history', () => {
        manager.recordError('peer1', 'ECONNREFUSED');
        manager.recordError('peer1', 'ETIMEDOUT');

        const history = manager.getErrorHistory('peer1');
        expect(history).toHaveLength(2);
        expect(history[0]?.code).toBe('ECONNREFUSED');
        expect(history[1]?.code).toBe('ETIMEDOUT');
      });

      it('records timestamps for each error', () => {
        const beforeTime = Date.now();
        manager.recordError('peer1', 'ECONNREFUSED');
        const afterTime = Date.now();

        const history = manager.getErrorHistory('peer1');
        expect(history[0]?.timestamp).toBeGreaterThanOrEqual(beforeTime);
        expect(history[0]?.timestamp).toBeLessThanOrEqual(afterTime);
      });

      it('tracks errors per peer independently', () => {
        manager.recordError('peer1', 'ECONNREFUSED');
        manager.recordError('peer2', 'ETIMEDOUT');

        expect(manager.getErrorHistory('peer1')).toHaveLength(1);
        expect(manager.getErrorHistory('peer2')).toHaveLength(1);
        expect(manager.getErrorHistory('peer1')[0]?.code).toBe('ECONNREFUSED');
        expect(manager.getErrorHistory('peer2')[0]?.code).toBe('ETIMEDOUT');
      });
    });

    describe('getErrorHistory', () => {
      it('returns empty array for new peer', () => {
        expect(manager.getErrorHistory('newpeer')).toStrictEqual([]);
      });

      it('returns readonly array', () => {
        manager.recordError('peer1', 'ECONNREFUSED');
        const history = manager.getErrorHistory('peer1');
        expect(Array.isArray(history)).toBe(true);
      });
    });
  });

  describe('permanent failure detection', () => {
    describe('isPermanentlyFailed', () => {
      it('returns false for new peer', () => {
        expect(manager.isPermanentlyFailed('newpeer')).toBe(false);
      });

      it('returns false when not enough errors recorded', () => {
        for (let i = 0; i < DEFAULT_CONSECUTIVE_ERROR_THRESHOLD - 1; i += 1) {
          manager.recordError('peer1', 'ECONNREFUSED');
        }
        expect(manager.isPermanentlyFailed('peer1')).toBe(false);
      });

      it('returns true after threshold consecutive identical permanent failure errors', () => {
        for (let i = 0; i < DEFAULT_CONSECUTIVE_ERROR_THRESHOLD; i += 1) {
          manager.recordError('peer1', 'ECONNREFUSED');
        }
        expect(manager.isPermanentlyFailed('peer1')).toBe(true);
      });

      it.each([...PERMANENT_FAILURE_ERROR_CODES])(
        'detects permanent failure for %s error code',
        (errorCode) => {
          for (let i = 0; i < DEFAULT_CONSECUTIVE_ERROR_THRESHOLD; i += 1) {
            manager.recordError('peer1', errorCode);
          }
          expect(manager.isPermanentlyFailed('peer1')).toBe(true);
        },
      );

      it('does not mark as permanently failed for non-permanent error codes', () => {
        for (let i = 0; i < DEFAULT_CONSECUTIVE_ERROR_THRESHOLD; i += 1) {
          manager.recordError('peer1', 'ETIMEDOUT');
        }
        expect(manager.isPermanentlyFailed('peer1')).toBe(false);
      });

      it('does not mark as permanently failed for mixed error codes', () => {
        manager.recordError('peer1', 'ECONNREFUSED');
        manager.recordError('peer1', 'ECONNREFUSED');
        manager.recordError('peer1', 'ETIMEDOUT'); // breaks the streak
        manager.recordError('peer1', 'ECONNREFUSED');
        manager.recordError('peer1', 'ECONNREFUSED');
        expect(manager.isPermanentlyFailed('peer1')).toBe(false);
      });

      it('detects permanent failure when streak completes at end of history', () => {
        // Mix of errors followed by consecutive permanent failure errors
        manager.recordError('peer1', 'ETIMEDOUT');
        manager.recordError('peer1', 'EPIPE');
        for (let i = 0; i < DEFAULT_CONSECUTIVE_ERROR_THRESHOLD; i += 1) {
          manager.recordError('peer1', 'ECONNREFUSED');
        }
        expect(manager.isPermanentlyFailed('peer1')).toBe(true);
      });
    });

    describe('clearPermanentFailure', () => {
      it('clears permanent failure status', () => {
        for (let i = 0; i < DEFAULT_CONSECUTIVE_ERROR_THRESHOLD; i += 1) {
          manager.recordError('peer1', 'ECONNREFUSED');
        }
        expect(manager.isPermanentlyFailed('peer1')).toBe(true);

        manager.clearPermanentFailure('peer1');

        expect(manager.isPermanentlyFailed('peer1')).toBe(false);
      });

      it('clears error history', () => {
        for (let i = 0; i < DEFAULT_CONSECUTIVE_ERROR_THRESHOLD; i += 1) {
          manager.recordError('peer1', 'ECONNREFUSED');
        }
        expect(manager.getErrorHistory('peer1').length).toBeGreaterThan(0);

        manager.clearPermanentFailure('peer1');

        expect(manager.getErrorHistory('peer1')).toStrictEqual([]);
      });

      it('allows reconnection after clearing', () => {
        for (let i = 0; i < DEFAULT_CONSECUTIVE_ERROR_THRESHOLD; i += 1) {
          manager.recordError('peer1', 'ECONNREFUSED');
        }
        expect(manager.startReconnection('peer1')).toBe(false);

        manager.clearPermanentFailure('peer1');

        expect(manager.startReconnection('peer1')).toBe(true);
      });

      it('works on non-failed peer', () => {
        expect(() => manager.clearPermanentFailure('peer1')).not.toThrow();
        expect(manager.isPermanentlyFailed('peer1')).toBe(false);
      });
    });

    describe('startReconnection with permanent failure', () => {
      it('returns false for permanently failed peer', () => {
        for (let i = 0; i < DEFAULT_CONSECUTIVE_ERROR_THRESHOLD; i += 1) {
          manager.recordError('peer1', 'ECONNREFUSED');
        }

        const result = manager.startReconnection('peer1');

        expect(result).toBe(false);
        expect(manager.isReconnecting('peer1')).toBe(false);
      });

      it('returns true for non-failed peer', () => {
        const result = manager.startReconnection('peer1');
        expect(result).toBe(true);
      });

      it('resets error history when starting new reconnection session', () => {
        manager.recordError('peer1', 'ETIMEDOUT');
        manager.recordError('peer1', 'EPIPE');
        expect(manager.getErrorHistory('peer1')).toHaveLength(2);

        manager.startReconnection('peer1');

        expect(manager.getErrorHistory('peer1')).toStrictEqual([]);
      });
    });

    describe('custom threshold', () => {
      it('respects custom consecutive error threshold', () => {
        const customManager = new ReconnectionManager({
          consecutiveErrorThreshold: 3,
        });

        // Not enough errors
        customManager.recordError('peer1', 'ECONNREFUSED');
        customManager.recordError('peer1', 'ECONNREFUSED');
        expect(customManager.isPermanentlyFailed('peer1')).toBe(false);

        // Exactly at threshold
        customManager.recordError('peer1', 'ECONNREFUSED');
        expect(customManager.isPermanentlyFailed('peer1')).toBe(true);
      });

      it('throws if consecutiveErrorThreshold is less than 1', () => {
        expect(
          () => new ReconnectionManager({ consecutiveErrorThreshold: 0 }),
        ).toThrow('consecutiveErrorThreshold must be at least 1');
        expect(
          () => new ReconnectionManager({ consecutiveErrorThreshold: -1 }),
        ).toThrow('consecutiveErrorThreshold must be at least 1');
      });
    });

    describe('error history capping', () => {
      it('caps error history to consecutive error threshold', () => {
        const customManager = new ReconnectionManager({
          consecutiveErrorThreshold: 3,
        });

        // Record more errors than threshold
        customManager.recordError('peer1', 'ERROR1');
        customManager.recordError('peer1', 'ERROR2');
        customManager.recordError('peer1', 'ERROR3');
        customManager.recordError('peer1', 'ERROR4');
        customManager.recordError('peer1', 'ERROR5');

        const history = customManager.getErrorHistory('peer1');
        expect(history).toHaveLength(3);
        expect(history[0]?.code).toBe('ERROR3');
        expect(history[1]?.code).toBe('ERROR4');
        expect(history[2]?.code).toBe('ERROR5');
      });

      it('maintains correct permanent failure detection with capped history', () => {
        const customManager = new ReconnectionManager({
          consecutiveErrorThreshold: 3,
        });

        // Record mixed errors that get capped
        customManager.recordError('peer1', 'ETIMEDOUT');
        customManager.recordError('peer1', 'EPIPE');
        customManager.recordError('peer1', 'ECONNREFUSED');
        customManager.recordError('peer1', 'ECONNREFUSED');
        customManager.recordError('peer1', 'ECONNREFUSED');

        // Last 3 are all ECONNREFUSED, should be permanently failed
        expect(customManager.isPermanentlyFailed('peer1')).toBe(true);
      });
    });

    describe('clearPeer with permanent failure', () => {
      it('clears permanent failure status when clearing peer', () => {
        for (let i = 0; i < DEFAULT_CONSECUTIVE_ERROR_THRESHOLD; i += 1) {
          manager.recordError('peer1', 'ECONNREFUSED');
        }
        expect(manager.isPermanentlyFailed('peer1')).toBe(true);

        manager.clearPeer('peer1');

        expect(manager.isPermanentlyFailed('peer1')).toBe(false);
        expect(manager.getErrorHistory('peer1')).toStrictEqual([]);
      });
    });

    describe('clear with permanent failure', () => {
      it('clears all permanent failure states', () => {
        for (let i = 0; i < DEFAULT_CONSECUTIVE_ERROR_THRESHOLD; i += 1) {
          manager.recordError('peer1', 'ECONNREFUSED');
          manager.recordError('peer2', 'EHOSTUNREACH');
        }
        expect(manager.isPermanentlyFailed('peer1')).toBe(true);
        expect(manager.isPermanentlyFailed('peer2')).toBe(true);

        manager.clear();

        expect(manager.isPermanentlyFailed('peer1')).toBe(false);
        expect(manager.isPermanentlyFailed('peer2')).toBe(false);
      });
    });
  });
});
