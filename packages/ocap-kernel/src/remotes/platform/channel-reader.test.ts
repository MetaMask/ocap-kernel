import { AbortError } from '@metamask/kernel-errors';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { makeChannelReader } from './channel-reader.ts';
import type { PeerRegistry } from './peer-registry.ts';
import type { Channel, RemoteMessageHandler } from '../types.ts';

function createMockChannel(
  peerId: string,
  readBehavior: () => Promise<Uint8Array | undefined>,
): Channel {
  return {
    peerId,
    msgStream: {
      read: vi.fn().mockImplementation(readBehavior),
      write: vi.fn(),
    },
  } as unknown as Channel;
}

function createMockPeerRegistry(): {
  peerRegistry: PeerRegistry;
  getChannel: ReturnType<typeof vi.fn>;
  updateLastConnectionTime: ReturnType<typeof vi.fn>;
  markIntentionallyClosed: ReturnType<typeof vi.fn>;
  removeChannel: ReturnType<typeof vi.fn>;
} {
  const getChannel = vi.fn();
  const updateLastConnectionTime = vi.fn();
  const markIntentionallyClosed = vi.fn();
  const removeChannel = vi.fn();
  return {
    peerRegistry: {
      getChannel,
      updateLastConnectionTime,
      markIntentionallyClosed,
      removeChannel,
    } as unknown as PeerRegistry,
    getChannel,
    updateLastConnectionTime,
    markIntentionallyClosed,
    removeChannel,
  };
}

function createMockLogger(): { log: ReturnType<typeof vi.fn> } {
  return { log: vi.fn() };
}

describe('makeChannelReader', () => {
  const peerId = 'peer1';
  let peerRegistry: PeerRegistry;
  let getChannel: ReturnType<typeof vi.fn>;
  let updateLastConnectionTime: ReturnType<typeof vi.fn>;
  let markIntentionallyClosed: ReturnType<typeof vi.fn>;
  let removeChannel: ReturnType<typeof vi.fn>;
  let remoteMessageHandler: RemoteMessageHandler;
  let onConnectionLoss: ReturnType<typeof vi.fn>;
  let onMessageReceived: ReturnType<typeof vi.fn>;
  let outputError: ReturnType<typeof vi.fn>;
  let logger: { log: ReturnType<typeof vi.fn> };
  let abortController: AbortController;

  beforeEach(() => {
    const mockRegistry = createMockPeerRegistry();
    peerRegistry = mockRegistry.peerRegistry;
    getChannel = mockRegistry.getChannel;
    updateLastConnectionTime = mockRegistry.updateLastConnectionTime;
    markIntentionallyClosed = mockRegistry.markIntentionallyClosed;
    removeChannel = mockRegistry.removeChannel;

    remoteMessageHandler = vi.fn().mockResolvedValue(undefined);
    onConnectionLoss = vi.fn();
    onMessageReceived = vi.fn();
    outputError = vi.fn();
    logger = createMockLogger();
    abortController = new AbortController();
  });

  function createReader() {
    return makeChannelReader({
      peerRegistry,
      remoteMessageHandler,
      signal: abortController.signal,
      logger: logger as unknown as Parameters<
        typeof makeChannelReader
      >[0]['logger'],
      onConnectionLoss,
      onMessageReceived,
      outputError,
    });
  }

  describe('readChannel', () => {
    describe('message processing', () => {
      it('reads and processes messages from channel', async () => {
        let readCount = 0;
        const channel = createMockChannel(peerId, async () => {
          readCount += 1;
          if (readCount === 1) {
            return new TextEncoder().encode('message1');
          }
          if (readCount === 2) {
            return new TextEncoder().encode('message2');
          }
          return undefined; // Stream end
        });
        getChannel.mockReturnValue(channel);

        const reader = createReader();
        await reader.readChannel(channel);

        expect(remoteMessageHandler).toHaveBeenCalledTimes(2);
        expect(remoteMessageHandler).toHaveBeenCalledWith(peerId, 'message1');
        expect(remoteMessageHandler).toHaveBeenCalledWith(peerId, 'message2');
      });

      it('calls onMessageReceived for each message', async () => {
        let readCount = 0;
        const channel = createMockChannel(peerId, async () => {
          readCount += 1;
          if (readCount <= 2) {
            return new TextEncoder().encode(`msg${readCount}`);
          }
          return undefined;
        });
        getChannel.mockReturnValue(channel);

        const reader = createReader();
        await reader.readChannel(channel);

        expect(onMessageReceived).toHaveBeenCalledTimes(2);
        expect(onMessageReceived).toHaveBeenCalledWith(peerId);
      });

      it('updates last connection time for each message', async () => {
        let readCount = 0;
        const channel = createMockChannel(peerId, async () => {
          readCount += 1;
          if (readCount === 1) {
            return new TextEncoder().encode('msg');
          }
          return undefined;
        });
        getChannel.mockReturnValue(channel);

        const reader = createReader();
        await reader.readChannel(channel);

        expect(updateLastConnectionTime).toHaveBeenCalledWith(peerId);
      });

      it('exits loop when stream returns undefined', async () => {
        const channel = createMockChannel(peerId, async () => undefined);
        getChannel.mockReturnValue(channel);

        const reader = createReader();
        await reader.readChannel(channel);

        expect(logger.log).toHaveBeenCalledWith(`${peerId}:: stream ended`);
      });
    });

    describe('abort handling', () => {
      it('throws AbortError when signal is aborted', async () => {
        const channel = createMockChannel(peerId, async () => {
          return new TextEncoder().encode('msg');
        });
        getChannel.mockReturnValue(channel);
        abortController.abort();

        const reader = createReader();

        await expect(reader.readChannel(channel)).rejects.toThrow(AbortError);
        expect(logger.log).toHaveBeenCalledWith(`reader abort: ${peerId}`);
      });

      it('checks abort signal before each read', async () => {
        let readCount = 0;
        const channel = createMockChannel(peerId, async () => {
          readCount += 1;
          if (readCount === 2) {
            // Abort during the second read, before returning data
            abortController.abort();
          }
          return new TextEncoder().encode(`msg${readCount}`);
        });
        getChannel.mockReturnValue(channel);

        const reader = createReader();

        await expect(reader.readChannel(channel)).rejects.toThrow(AbortError);
        // First message processed, second message processed, then abort checked on third iteration
        expect(remoteMessageHandler).toHaveBeenCalledTimes(2);
      });
    });

    describe('error handling', () => {
      it('triggers connection loss on read error for current channel', async () => {
        const error = new Error('Read failed');
        const channel = createMockChannel(peerId, async () => {
          throw error;
        });
        getChannel.mockReturnValue(channel);

        const reader = createReader();

        await expect(reader.readChannel(channel)).rejects.toThrow(error);
        expect(onConnectionLoss).toHaveBeenCalledWith(peerId, channel);
        expect(outputError).toHaveBeenCalledWith(
          peerId,
          `reading message from ${peerId}`,
          error,
        );
      });

      it('ignores errors from stale channels', async () => {
        const error = new Error('Read failed');
        const channel = createMockChannel(peerId, async () => {
          throw error;
        });
        const differentChannel = createMockChannel(
          peerId,
          async () => undefined,
        );
        getChannel.mockReturnValue(differentChannel); // Different channel is current

        const reader = createReader();

        await expect(reader.readChannel(channel)).rejects.toThrow(error);
        expect(onConnectionLoss).not.toHaveBeenCalled();
        expect(outputError).not.toHaveBeenCalled();
        expect(logger.log).toHaveBeenCalledWith(
          `${peerId}:: ignoring error from stale channel`,
        );
      });
    });

    describe('graceful disconnect (SCTP abort)', () => {
      it('marks peer as intentionally closed on SCTP user-initiated abort', async () => {
        const sctpError = Object.assign(new Error('SCTP failure'), {
          errorDetail: 'sctp-failure',
          sctpCauseCode: 12,
        });
        const channel = createMockChannel(peerId, async () => {
          throw sctpError;
        });
        getChannel.mockReturnValue(channel);

        const reader = createReader();

        await expect(reader.readChannel(channel)).rejects.toThrow('SCTP');
        expect(markIntentionallyClosed).toHaveBeenCalledWith(peerId);
        expect(onConnectionLoss).not.toHaveBeenCalled();
        expect(logger.log).toHaveBeenCalledWith(
          `${peerId}:: remote intentionally disconnected`,
        );
      });

      it('does not mark as intentionally closed for stale channel SCTP abort', async () => {
        const sctpError = Object.assign(new Error('SCTP failure'), {
          errorDetail: 'sctp-failure',
          sctpCauseCode: 12,
        });
        const channel = createMockChannel(peerId, async () => {
          throw sctpError;
        });
        const differentChannel = createMockChannel(
          peerId,
          async () => undefined,
        );
        getChannel.mockReturnValue(differentChannel);

        const reader = createReader();

        await expect(reader.readChannel(channel)).rejects.toThrow('SCTP');
        expect(markIntentionallyClosed).not.toHaveBeenCalled();
        expect(logger.log).toHaveBeenCalledWith(
          `${peerId}:: stale channel intentionally disconnected`,
        );
      });
    });

    describe('cleanup', () => {
      it('removes channel on normal exit', async () => {
        const channel = createMockChannel(peerId, async () => undefined);
        getChannel.mockReturnValue(channel);

        const reader = createReader();
        await reader.readChannel(channel);

        expect(removeChannel).toHaveBeenCalledWith(peerId);
      });

      it('removes channel on error', async () => {
        const channel = createMockChannel(peerId, async () => {
          throw new Error('Read failed');
        });
        getChannel.mockReturnValue(channel);

        const reader = createReader();

        await expect(reader.readChannel(channel)).rejects.toThrow(
          'Read failed',
        );
        expect(removeChannel).toHaveBeenCalledWith(peerId);
      });

      it('does not remove different channel', async () => {
        const channel = createMockChannel(peerId, async () => undefined);
        const differentChannel = createMockChannel(
          peerId,
          async () => undefined,
        );
        getChannel.mockReturnValue(differentChannel);

        const reader = createReader();
        await reader.readChannel(channel);

        expect(removeChannel).not.toHaveBeenCalled();
      });

      it('removes channel on abort', async () => {
        const channel = createMockChannel(peerId, async () => {
          return new TextEncoder().encode('msg');
        });
        getChannel.mockReturnValue(channel);
        abortController.abort();

        const reader = createReader();

        await expect(reader.readChannel(channel)).rejects.toThrow(AbortError);
        expect(removeChannel).toHaveBeenCalledWith(peerId);
      });
    });
  });

  describe('integration scenarios', () => {
    it('handles multiple messages then graceful close', async () => {
      let readCount = 0;
      const channel = createMockChannel(peerId, async () => {
        readCount += 1;
        if (readCount <= 3) {
          return new TextEncoder().encode(`message${readCount}`);
        }
        return undefined;
      });
      getChannel.mockReturnValue(channel);

      const reader = createReader();
      await reader.readChannel(channel);

      expect(remoteMessageHandler).toHaveBeenCalledTimes(3);
      expect(onMessageReceived).toHaveBeenCalledTimes(3);
      expect(removeChannel).toHaveBeenCalled();
    });

    it('handles error mid-stream', async () => {
      let readCount = 0;
      const error = new Error('Connection lost');
      const channel = createMockChannel(peerId, async () => {
        readCount += 1;
        if (readCount === 1) {
          return new TextEncoder().encode('msg1');
        }
        throw error;
      });
      getChannel.mockReturnValue(channel);

      const reader = createReader();

      await expect(reader.readChannel(channel)).rejects.toThrow(error);
      expect(remoteMessageHandler).toHaveBeenCalledTimes(1);
      expect(onConnectionLoss).toHaveBeenCalledWith(peerId, channel);
    });
  });
});
