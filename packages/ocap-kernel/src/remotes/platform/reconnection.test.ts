import * as kernelUtils from '@metamask/kernel-utils';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { ReconnectionManager } from './reconnection.ts';

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
});
