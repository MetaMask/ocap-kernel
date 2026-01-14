import { describe, it, expect, vi, beforeEach } from 'vitest';

import { reuseOrReturnChannel } from './channel-utils.ts';
import type { ConnectionFactory } from './connection-factory.ts';
import type { PeerRegistry } from './peer-registry.ts';
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

function createMockPeerRegistry(): {
  peerRegistry: PeerRegistry;
  getChannel: ReturnType<typeof vi.fn>;
} {
  const getChannel = vi.fn();
  return {
    peerRegistry: { getChannel } as unknown as PeerRegistry,
    getChannel,
  };
}

function createMockConnectionFactory(): {
  connectionFactory: ConnectionFactory;
  closeChannel: ReturnType<typeof vi.fn>;
} {
  const closeChannel = vi.fn().mockResolvedValue(undefined);
  return {
    connectionFactory: { closeChannel } as unknown as ConnectionFactory,
    closeChannel,
  };
}

describe('reuseOrReturnChannel', () => {
  const peerId = 'peer1';
  let dialedChannel: Channel;
  let peerRegistry: PeerRegistry;
  let getChannel: ReturnType<typeof vi.fn>;
  let connectionFactory: ConnectionFactory;
  let closeChannel: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    dialedChannel = createMockChannel(peerId);
    const mockRegistry = createMockPeerRegistry();
    peerRegistry = mockRegistry.peerRegistry;
    getChannel = mockRegistry.getChannel;
    const mockFactory = createMockConnectionFactory();
    connectionFactory = mockFactory.connectionFactory;
    closeChannel = mockFactory.closeChannel;
  });

  describe('when no existing channel', () => {
    it('returns the dialed channel', async () => {
      getChannel.mockReturnValue(undefined);

      const result = await reuseOrReturnChannel(
        peerId,
        dialedChannel,
        peerRegistry,
        connectionFactory,
      );

      expect(result).toBe(dialedChannel);
      expect(closeChannel).not.toHaveBeenCalled();
    });
  });

  describe('when existing channel is different from dialed', () => {
    it('closes dialed channel and returns existing if still present', async () => {
      const existingChannel = createMockChannel(peerId);
      getChannel
        .mockReturnValueOnce(existingChannel) // First check
        .mockReturnValueOnce(existingChannel); // After close check

      const result = await reuseOrReturnChannel(
        peerId,
        dialedChannel,
        peerRegistry,
        connectionFactory,
      );

      expect(closeChannel).toHaveBeenCalledWith(dialedChannel, peerId);
      expect(result).toBe(existingChannel);
    });

    it('returns new channel if existing was replaced during close', async () => {
      const existingChannel = createMockChannel(peerId);
      const newChannel = createMockChannel(peerId);
      getChannel
        .mockReturnValueOnce(existingChannel) // First check
        .mockReturnValueOnce(newChannel); // After close - different channel

      const result = await reuseOrReturnChannel(
        peerId,
        dialedChannel,
        peerRegistry,
        connectionFactory,
      );

      expect(closeChannel).toHaveBeenCalledWith(dialedChannel, peerId);
      expect(result).toBe(newChannel);
    });

    it('returns null if existing channel died during close', async () => {
      const existingChannel = createMockChannel(peerId);
      getChannel
        .mockReturnValueOnce(existingChannel) // First check
        .mockReturnValueOnce(undefined); // After close - no channel

      const result = await reuseOrReturnChannel(
        peerId,
        dialedChannel,
        peerRegistry,
        connectionFactory,
      );

      expect(closeChannel).toHaveBeenCalledWith(dialedChannel, peerId);
      expect(result).toBeNull();
    });
  });

  describe('when existing channel is same as dialed', () => {
    it('returns existing channel if still present', async () => {
      // Same channel for both dialed and existing
      getChannel
        .mockReturnValueOnce(dialedChannel) // First check - same as dialed
        .mockReturnValueOnce(dialedChannel); // Second check - still same

      const result = await reuseOrReturnChannel(
        peerId,
        dialedChannel,
        peerRegistry,
        connectionFactory,
      );

      expect(closeChannel).not.toHaveBeenCalled();
      expect(result).toBe(dialedChannel);
    });

    it('returns new channel if original was replaced', async () => {
      const newChannel = createMockChannel(peerId);
      getChannel
        .mockReturnValueOnce(dialedChannel) // First check - same as dialed
        .mockReturnValueOnce(newChannel); // Second check - different

      const result = await reuseOrReturnChannel(
        peerId,
        dialedChannel,
        peerRegistry,
        connectionFactory,
      );

      expect(closeChannel).not.toHaveBeenCalled();
      expect(result).toBe(newChannel);
    });

    it('returns null if channel was removed', async () => {
      getChannel
        .mockReturnValueOnce(dialedChannel) // First check - same as dialed
        .mockReturnValueOnce(undefined); // Second check - removed

      const result = await reuseOrReturnChannel(
        peerId,
        dialedChannel,
        peerRegistry,
        connectionFactory,
      );

      expect(closeChannel).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('handles close channel error gracefully', async () => {
      const existingChannel = createMockChannel(peerId);
      getChannel
        .mockReturnValueOnce(existingChannel)
        .mockReturnValueOnce(existingChannel);
      closeChannel.mockRejectedValue(new Error('Close failed'));

      await expect(
        reuseOrReturnChannel(
          peerId,
          dialedChannel,
          peerRegistry,
          connectionFactory,
        ),
      ).rejects.toThrow('Close failed');
    });

    it('makes correct sequence of calls', async () => {
      const existingChannel = createMockChannel(peerId);
      getChannel
        .mockReturnValueOnce(existingChannel)
        .mockReturnValueOnce(existingChannel);

      await reuseOrReturnChannel(
        peerId,
        dialedChannel,
        peerRegistry,
        connectionFactory,
      );

      expect(getChannel).toHaveBeenCalledTimes(2);
      expect(getChannel).toHaveBeenNthCalledWith(1, peerId);
      expect(getChannel).toHaveBeenNthCalledWith(2, peerId);
    });
  });
});
