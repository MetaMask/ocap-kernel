import { describe, it, expect, beforeEach, vi } from 'vitest';

import { PeerRegistry } from './peer-registry.ts';
import type { Channel } from '../types.ts';

function createMockChannel(peerId: string): Channel {
  return {
    peerId,
    msgStream: {
      read: vi.fn(),
      write: vi.fn(),
    },
  } as unknown as Channel;
}

describe('PeerRegistry', () => {
  let registry: PeerRegistry;

  beforeEach(() => {
    registry = new PeerRegistry(100);
  });

  describe('constructor', () => {
    it('creates empty registry with specified max queue', () => {
      expect(registry.channelCount).toBe(0);
    });
  });

  describe('channel management', () => {
    describe('getChannel', () => {
      it('returns undefined for unknown peer', () => {
        expect(registry.getChannel('unknown')).toBeUndefined();
      });

      it('returns channel for known peer', () => {
        const channel = createMockChannel('peer1');
        registry.setChannel('peer1', channel);

        expect(registry.getChannel('peer1')).toBe(channel);
      });
    });

    describe('hasChannel', () => {
      it('returns false for unknown peer', () => {
        expect(registry.hasChannel('unknown')).toBe(false);
      });

      it('returns true for peer with channel', () => {
        const channel = createMockChannel('peer1');
        registry.setChannel('peer1', channel);

        expect(registry.hasChannel('peer1')).toBe(true);
      });
    });

    describe('setChannel', () => {
      it('sets channel for peer', () => {
        const channel = createMockChannel('peer1');

        registry.setChannel('peer1', channel);

        expect(registry.getChannel('peer1')).toBe(channel);
      });

      it('returns undefined when no previous channel', () => {
        const channel = createMockChannel('peer1');

        const previous = registry.setChannel('peer1', channel);

        expect(previous).toBeUndefined();
      });

      it('returns previous channel when replacing', () => {
        const channel1 = createMockChannel('peer1');
        const channel2 = createMockChannel('peer1');

        registry.setChannel('peer1', channel1);
        const previous = registry.setChannel('peer1', channel2);

        expect(previous).toBe(channel1);
        expect(registry.getChannel('peer1')).toBe(channel2);
      });

      it('updates last connection time', () => {
        const channel = createMockChannel('peer1');
        const before = Date.now();

        registry.setChannel('peer1', channel);

        const lastTime = registry.getLastConnectionTime('peer1');
        expect(lastTime).toBeDefined();
        expect(lastTime).toBeGreaterThanOrEqual(before);
        expect(lastTime).toBeLessThanOrEqual(Date.now());
      });
    });

    describe('removeChannel', () => {
      it('returns false for unknown peer', () => {
        expect(registry.removeChannel('unknown')).toBe(false);
      });

      it('removes channel and returns true', () => {
        const channel = createMockChannel('peer1');
        registry.setChannel('peer1', channel);

        const result = registry.removeChannel('peer1');

        expect(result).toBe(true);
        expect(registry.getChannel('peer1')).toBeUndefined();
        expect(registry.hasChannel('peer1')).toBe(false);
      });
    });

    describe('channelCount', () => {
      it('returns 0 for empty registry', () => {
        expect(registry.channelCount).toBe(0);
      });

      it('tracks active channels', () => {
        registry.setChannel('peer1', createMockChannel('peer1'));
        expect(registry.channelCount).toBe(1);

        registry.setChannel('peer2', createMockChannel('peer2'));
        expect(registry.channelCount).toBe(2);

        registry.removeChannel('peer1');
        expect(registry.channelCount).toBe(1);
      });
    });
  });

  describe('message queue management', () => {
    describe('getMessageQueue', () => {
      it('creates new queue for unknown peer', () => {
        const queue = registry.getMessageQueue('peer1');

        expect(queue).toBeDefined();
        expect(queue).toHaveLength(0);
      });

      it('returns same queue on subsequent calls', () => {
        const queue1 = registry.getMessageQueue('peer1');
        queue1.enqueue('message');

        const queue2 = registry.getMessageQueue('peer1');

        expect(queue2).toBe(queue1);
        expect(queue2).toHaveLength(1);
      });

      it('sets last connection time for new peer', () => {
        const before = Date.now();

        registry.getMessageQueue('peer1');

        const lastTime = registry.getLastConnectionTime('peer1');
        expect(lastTime).toBeDefined();
        expect(lastTime).toBeGreaterThanOrEqual(before);
      });

      it('does not override existing last connection time', () => {
        const channel = createMockChannel('peer1');
        registry.setChannel('peer1', channel);
        const originalTime = registry.getLastConnectionTime('peer1');

        // Small delay to ensure time difference
        registry.getMessageQueue('peer1');

        expect(registry.getLastConnectionTime('peer1')).toBe(originalTime);
      });

      it('respects maxQueue setting', () => {
        const smallRegistry = new PeerRegistry(3);
        const queue = smallRegistry.getMessageQueue('peer1');

        queue.enqueue('msg1');
        queue.enqueue('msg2');
        queue.enqueue('msg3');
        queue.enqueue('msg4');

        expect(queue).toHaveLength(3);
      });
    });
  });

  describe('intentionally closed management', () => {
    describe('isIntentionallyClosed', () => {
      it('returns false for unknown peer', () => {
        expect(registry.isIntentionallyClosed('unknown')).toBe(false);
      });

      it('returns true after marking', () => {
        registry.markIntentionallyClosed('peer1');

        expect(registry.isIntentionallyClosed('peer1')).toBe(true);
      });
    });

    describe('markIntentionallyClosed', () => {
      it('marks peer as intentionally closed', () => {
        registry.markIntentionallyClosed('peer1');

        expect(registry.isIntentionallyClosed('peer1')).toBe(true);
      });

      it('is idempotent', () => {
        registry.markIntentionallyClosed('peer1');
        registry.markIntentionallyClosed('peer1');

        expect(registry.isIntentionallyClosed('peer1')).toBe(true);
      });
    });

    describe('clearIntentionallyClosed', () => {
      it('clears intentionally closed flag', () => {
        registry.markIntentionallyClosed('peer1');
        expect(registry.isIntentionallyClosed('peer1')).toBe(true);

        registry.clearIntentionallyClosed('peer1');

        expect(registry.isIntentionallyClosed('peer1')).toBe(false);
      });

      it('handles unknown peer', () => {
        expect(() =>
          registry.clearIntentionallyClosed('unknown'),
        ).not.toThrow();
      });
    });
  });

  describe('last connection time management', () => {
    describe('updateLastConnectionTime', () => {
      it('updates time for peer', () => {
        const before = Date.now();

        registry.updateLastConnectionTime('peer1');

        const lastTime = registry.getLastConnectionTime('peer1');
        expect(lastTime).toBeDefined();
        expect(lastTime).toBeGreaterThanOrEqual(before);
        expect(lastTime).toBeLessThanOrEqual(Date.now());
      });

      it('overwrites previous time', async () => {
        registry.updateLastConnectionTime('peer1');
        const firstTime = registry.getLastConnectionTime('peer1');

        // Small delay
        await new Promise((resolve) => setTimeout(resolve, 10));

        registry.updateLastConnectionTime('peer1');
        const secondTime = registry.getLastConnectionTime('peer1');

        expect(secondTime).toBeGreaterThan(firstTime as number);
      });
    });

    describe('getLastConnectionTime', () => {
      it('returns undefined for unknown peer', () => {
        expect(registry.getLastConnectionTime('unknown')).toBeUndefined();
      });
    });
  });

  describe('location hints management', () => {
    describe('getLocationHints', () => {
      it('returns empty array for unknown peer', () => {
        expect(registry.getLocationHints('unknown')).toStrictEqual([]);
      });

      it('returns registered hints', () => {
        registry.registerLocationHints('peer1', ['/ip4/127.0.0.1/tcp/4001']);

        expect(registry.getLocationHints('peer1')).toStrictEqual([
          '/ip4/127.0.0.1/tcp/4001',
        ]);
      });
    });

    describe('registerLocationHints', () => {
      it('registers hints for new peer', () => {
        registry.registerLocationHints('peer1', ['/ip4/127.0.0.1/tcp/4001']);

        expect(registry.getLocationHints('peer1')).toStrictEqual([
          '/ip4/127.0.0.1/tcp/4001',
        ]);
      });

      it('merges with existing hints', () => {
        registry.registerLocationHints('peer1', ['/ip4/127.0.0.1/tcp/4001']);
        registry.registerLocationHints('peer1', ['/ip4/192.168.1.1/tcp/4001']);

        const hints = registry.getLocationHints('peer1');
        expect(hints).toContain('/ip4/127.0.0.1/tcp/4001');
        expect(hints).toContain('/ip4/192.168.1.1/tcp/4001');
        expect(hints).toHaveLength(2);
      });

      it('deduplicates hints', () => {
        registry.registerLocationHints('peer1', ['/ip4/127.0.0.1/tcp/4001']);
        registry.registerLocationHints('peer1', ['/ip4/127.0.0.1/tcp/4001']);

        expect(registry.getLocationHints('peer1')).toHaveLength(1);
      });

      it('handles multiple hints at once', () => {
        registry.registerLocationHints('peer1', [
          '/ip4/127.0.0.1/tcp/4001',
          '/ip4/192.168.1.1/tcp/4001',
        ]);

        expect(registry.getLocationHints('peer1')).toHaveLength(2);
      });
    });
  });

  describe('stale peer detection', () => {
    describe('findStalePeers', () => {
      it('returns empty array when no peers', () => {
        const stalePeers = registry.findStalePeers(1000, () => false);

        expect(stalePeers).toStrictEqual([]);
      });

      it('identifies stale peers without channel or reconnection', () => {
        // Create a peer with only a message queue (no channel)
        registry.getMessageQueue('peer1');

        // Use -1 timeout so any time since last activity makes it stale
        // (timeSinceLastActivity > -1 is always true for non-negative values)
        const stalePeers = registry.findStalePeers(-1, () => false);

        expect(stalePeers).toContain('peer1');
      });

      it('excludes peers with active channel', () => {
        registry.setChannel('peer1', createMockChannel('peer1'));

        // Even with 0 timeout, peer with active channel should not be stale
        const stalePeers = registry.findStalePeers(0, () => false);

        expect(stalePeers).not.toContain('peer1');
      });

      it('excludes reconnecting peers', () => {
        registry.getMessageQueue('peer1');

        // Even with 0 timeout, reconnecting peer should not be stale
        const stalePeers = registry.findStalePeers(
          0,
          (peerId) => peerId === 'peer1',
        );

        expect(stalePeers).not.toContain('peer1');
      });

      it('excludes peers within timeout', () => {
        registry.getMessageQueue('peer1');

        // Use a large timeout so peer is within timeout
        const stalePeers = registry.findStalePeers(
          Number.MAX_SAFE_INTEGER,
          () => false,
        );

        expect(stalePeers).not.toContain('peer1');
      });
    });
  });

  describe('peer removal', () => {
    describe('removePeer', () => {
      it('removes all state for peer', () => {
        const channel = createMockChannel('peer1');
        registry.setChannel('peer1', channel);
        registry.getMessageQueue('peer1').enqueue('msg');
        registry.markIntentionallyClosed('peer1');
        registry.registerLocationHints('peer1', ['/ip4/127.0.0.1/tcp/4001']);

        registry.removePeer('peer1');

        expect(registry.getChannel('peer1')).toBeUndefined();
        expect(registry.isIntentionallyClosed('peer1')).toBe(false);
        // After removePeer, lastConnectionTime should be undefined
        // (calling getMessageQueue would create new state)
        expect(registry.getLastConnectionTime('peer1')).toBeUndefined();
        expect(registry.getLocationHints('peer1')).toStrictEqual([]);
      });

      it('handles unknown peer', () => {
        expect(() => registry.removePeer('unknown')).not.toThrow();
      });

      it('does not affect other peers', () => {
        registry.setChannel('peer1', createMockChannel('peer1'));
        registry.setChannel('peer2', createMockChannel('peer2'));

        registry.removePeer('peer1');

        expect(registry.hasChannel('peer1')).toBe(false);
        expect(registry.hasChannel('peer2')).toBe(true);
      });
    });

    describe('clear', () => {
      it('removes all state', () => {
        registry.setChannel('peer1', createMockChannel('peer1'));
        registry.setChannel('peer2', createMockChannel('peer2'));
        registry.getMessageQueue('peer1').enqueue('msg');
        registry.markIntentionallyClosed('peer1');
        registry.registerLocationHints('peer1', ['/ip4/127.0.0.1/tcp/4001']);

        registry.clear();

        expect(registry.channelCount).toBe(0);
        expect(registry.getChannel('peer1')).toBeUndefined();
        expect(registry.getChannel('peer2')).toBeUndefined();
        expect(registry.isIntentionallyClosed('peer1')).toBe(false);
        expect(registry.getLocationHints('peer1')).toStrictEqual([]);
      });

      it('handles empty registry', () => {
        expect(() => registry.clear()).not.toThrow();
      });
    });
  });

  describe('integration scenarios', () => {
    it('handles typical peer lifecycle', () => {
      const peerId = 'peer1';

      // Initial connection
      const channel = createMockChannel(peerId);
      registry.setChannel(peerId, channel);
      registry.registerLocationHints(peerId, ['/ip4/127.0.0.1/tcp/4001']);

      expect(registry.hasChannel(peerId)).toBe(true);

      // Receive messages (updates activity time)
      registry.updateLastConnectionTime(peerId);

      // Connection lost
      registry.removeChannel(peerId);
      const queue = registry.getMessageQueue(peerId);
      queue.enqueue('pending-message');

      expect(registry.hasChannel(peerId)).toBe(false);
      expect(queue).toHaveLength(1);

      // Reconnect
      const newChannel = createMockChannel(peerId);
      registry.setChannel(peerId, newChannel);

      expect(registry.hasChannel(peerId)).toBe(true);
    });

    it('handles intentional close flow', () => {
      const peerId = 'peer1';
      const channel = createMockChannel(peerId);

      registry.setChannel(peerId, channel);
      registry.markIntentionallyClosed(peerId);
      registry.removeChannel(peerId);
      registry.getMessageQueue(peerId).clear();

      expect(registry.hasChannel(peerId)).toBe(false);
      expect(registry.isIntentionallyClosed(peerId)).toBe(true);

      // Later reconnect
      registry.clearIntentionallyClosed(peerId);
      expect(registry.isIntentionallyClosed(peerId)).toBe(false);
    });

    it('handles multiple peers independently', () => {
      registry.setChannel('peer1', createMockChannel('peer1'));
      registry.setChannel('peer2', createMockChannel('peer2'));
      registry.markIntentionallyClosed('peer1');
      registry.getMessageQueue('peer2').enqueue('msg');

      expect(registry.hasChannel('peer1')).toBe(true);
      expect(registry.hasChannel('peer2')).toBe(true);
      expect(registry.isIntentionallyClosed('peer1')).toBe(true);
      expect(registry.isIntentionallyClosed('peer2')).toBe(false);
      expect(registry.getMessageQueue('peer2')).toHaveLength(1);
    });
  });
});
