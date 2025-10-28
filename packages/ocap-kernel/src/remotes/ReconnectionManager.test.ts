import * as kernelUtils from '@metamask/kernel-utils';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { ReconnectionManager } from './ReconnectionManager.ts';

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
    it('should start reconnection for a peer', () => {
      expect(manager.isReconnecting('peer1')).toBe(false);

      manager.startReconnection('peer1');

      expect(manager.isReconnecting('peer1')).toBe(true);
    });

    it('should handle multiple peers independently', () => {
      manager.startReconnection('peer1');
      manager.startReconnection('peer2');

      expect(manager.isReconnecting('peer1')).toBe(true);
      expect(manager.isReconnecting('peer2')).toBe(true);
      expect(manager.isReconnecting('peer3')).toBe(false);
    });

    it('should be idempotent', () => {
      manager.startReconnection('peer1');
      manager.startReconnection('peer1');

      expect(manager.isReconnecting('peer1')).toBe(true);
    });
  });

  describe('stopReconnection', () => {
    it('should stop reconnection for a peer', () => {
      manager.startReconnection('peer1');
      expect(manager.isReconnecting('peer1')).toBe(true);

      manager.stopReconnection('peer1');

      expect(manager.isReconnecting('peer1')).toBe(false);
    });

    it('should work on non-reconnecting peer', () => {
      expect(manager.isReconnecting('peer1')).toBe(false);

      manager.stopReconnection('peer1');

      expect(manager.isReconnecting('peer1')).toBe(false);
    });

    it('should not affect other peers', () => {
      manager.startReconnection('peer1');
      manager.startReconnection('peer2');

      manager.stopReconnection('peer1');

      expect(manager.isReconnecting('peer1')).toBe(false);
      expect(manager.isReconnecting('peer2')).toBe(true);
    });
  });

  describe('isReconnecting', () => {
    it('should return false for new peer', () => {
      expect(manager.isReconnecting('newpeer')).toBe(false);
    });

    it('should track reconnection state correctly', () => {
      expect(manager.isReconnecting('peer1')).toBe(false);

      manager.startReconnection('peer1');
      expect(manager.isReconnecting('peer1')).toBe(true);

      manager.stopReconnection('peer1');
      expect(manager.isReconnecting('peer1')).toBe(false);
    });
  });

  describe('incrementAttempt', () => {
    it('should increment attempt count', () => {
      expect(manager.getAttemptCount('peer1')).toBe(0);

      const count1 = manager.incrementAttempt('peer1');
      expect(count1).toBe(1);
      expect(manager.getAttemptCount('peer1')).toBe(1);

      const count2 = manager.incrementAttempt('peer1');
      expect(count2).toBe(2);
      expect(manager.getAttemptCount('peer1')).toBe(2);
    });

    it('should track attempts per peer independently', () => {
      manager.incrementAttempt('peer1');
      manager.incrementAttempt('peer1');
      manager.incrementAttempt('peer2');

      expect(manager.getAttemptCount('peer1')).toBe(2);
      expect(manager.getAttemptCount('peer2')).toBe(1);
      expect(manager.getAttemptCount('peer3')).toBe(0);
    });

    it('should return the new count', () => {
      expect(manager.incrementAttempt('peer1')).toBe(1);
      expect(manager.incrementAttempt('peer1')).toBe(2);
      expect(manager.incrementAttempt('peer1')).toBe(3);
    });
  });

  describe('resetBackoff', () => {
    it('should reset attempt count to zero', () => {
      manager.incrementAttempt('peer1');
      manager.incrementAttempt('peer1');
      expect(manager.getAttemptCount('peer1')).toBe(2);

      manager.resetBackoff('peer1');

      expect(manager.getAttemptCount('peer1')).toBe(0);
    });

    it('should work on peer with no attempts', () => {
      expect(manager.getAttemptCount('peer1')).toBe(0);

      manager.resetBackoff('peer1');

      expect(manager.getAttemptCount('peer1')).toBe(0);
    });

    it('should not affect reconnection state', () => {
      manager.startReconnection('peer1');
      manager.incrementAttempt('peer1');

      manager.resetBackoff('peer1');

      expect(manager.isReconnecting('peer1')).toBe(true);
      expect(manager.getAttemptCount('peer1')).toBe(0);
    });

    it('should only reset specified peer', () => {
      manager.incrementAttempt('peer1');
      manager.incrementAttempt('peer2');

      manager.resetBackoff('peer1');

      expect(manager.getAttemptCount('peer1')).toBe(0);
      expect(manager.getAttemptCount('peer2')).toBe(1);
    });
  });

  describe('calculateBackoff', () => {
    it('should calculate backoff for current attempt count', () => {
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

    it('should calculate independently for different peers', () => {
      manager.incrementAttempt('peer1');
      manager.incrementAttempt('peer1');

      const backoff1 = manager.calculateBackoff('peer1');
      const backoff2 = manager.calculateBackoff('peer2');

      expect(backoff1).toBe(200); // 2nd attempt (attemptCount = 2)
      expect(backoff2).toBe(50); // No attempts yet (attemptCount = 0)
    });

    it('should respect backoff after reset', () => {
      manager.incrementAttempt('peer1');
      manager.incrementAttempt('peer1');
      manager.resetBackoff('peer1');

      const backoff = manager.calculateBackoff('peer1');

      expect(backoff).toBe(50); // Back to 0 attempts
    });
  });

  describe('shouldRetry', () => {
    it('should return true for infinite retries (maxAttempts = 0)', () => {
      for (let i = 0; i < 100; i += 1) {
        manager.incrementAttempt('peer1');
      }

      expect(manager.shouldRetry('peer1', 0)).toBe(true);
    });

    it('should respect max attempts limit', () => {
      const maxAttempts = 3;

      expect(manager.shouldRetry('peer1', maxAttempts)).toBe(true);

      manager.incrementAttempt('peer1');
      expect(manager.shouldRetry('peer1', maxAttempts)).toBe(true);

      manager.incrementAttempt('peer1');
      expect(manager.shouldRetry('peer1', maxAttempts)).toBe(true);

      manager.incrementAttempt('peer1');
      expect(manager.shouldRetry('peer1', maxAttempts)).toBe(false);
    });

    it('should allow retry after reset', () => {
      const maxAttempts = 2;

      manager.incrementAttempt('peer1');
      manager.incrementAttempt('peer1');
      expect(manager.shouldRetry('peer1', maxAttempts)).toBe(false);

      manager.resetBackoff('peer1');

      expect(manager.shouldRetry('peer1', maxAttempts)).toBe(true);
    });

    it('should handle different limits per peer', () => {
      manager.incrementAttempt('peer1');
      manager.incrementAttempt('peer1');

      expect(manager.shouldRetry('peer1', 2)).toBe(false);
      expect(manager.shouldRetry('peer1', 3)).toBe(true);
      expect(manager.shouldRetry('peer1', 0)).toBe(true);
    });
  });

  describe('getAttemptCount', () => {
    it('should return 0 for new peer', () => {
      expect(manager.getAttemptCount('newpeer')).toBe(0);
    });

    it('should return current attempt count', () => {
      manager.incrementAttempt('peer1');
      manager.incrementAttempt('peer1');
      manager.incrementAttempt('peer1');

      expect(manager.getAttemptCount('peer1')).toBe(3);
    });

    it('should reflect resets', () => {
      manager.incrementAttempt('peer1');
      manager.incrementAttempt('peer1');
      manager.resetBackoff('peer1');

      expect(manager.getAttemptCount('peer1')).toBe(0);
    });
  });

  describe('resetAllBackoffs', () => {
    it('should reset attempts for all reconnecting peers', () => {
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

    it('should not affect reconnection state', () => {
      manager.startReconnection('peer1');
      manager.incrementAttempt('peer1');

      manager.resetAllBackoffs();

      expect(manager.isReconnecting('peer1')).toBe(true);
      expect(manager.getAttemptCount('peer1')).toBe(0);
    });

    it('should handle empty state', () => {
      expect(() => manager.resetAllBackoffs()).not.toThrow();
    });
  });

  describe('clear', () => {
    it('should clear all states', () => {
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

    it('should allow new operations after clear', () => {
      manager.startReconnection('peer1');
      manager.clear();

      manager.startReconnection('peer1');
      manager.incrementAttempt('peer1');

      expect(manager.isReconnecting('peer1')).toBe(true);
      expect(manager.getAttemptCount('peer1')).toBe(1);
    });

    it('should handle empty state', () => {
      expect(() => manager.clear()).not.toThrow();
    });
  });

  describe('clearPeer', () => {
    it('should clear state for specific peer', () => {
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

    it('should handle non-existent peer', () => {
      expect(() => manager.clearPeer('nonexistent')).not.toThrow();
    });

    it('should allow re-adding peer after clear', () => {
      manager.startReconnection('peer1');
      manager.incrementAttempt('peer1');

      manager.clearPeer('peer1');

      manager.startReconnection('peer1');
      expect(manager.isReconnecting('peer1')).toBe(true);
      expect(manager.getAttemptCount('peer1')).toBe(0);
    });
  });

  describe('integration scenarios', () => {
    it('should handle typical reconnection flow', () => {
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

    it('should handle multiple peers with different states', () => {
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

    it('should handle rapid state changes', () => {
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
  });
});
