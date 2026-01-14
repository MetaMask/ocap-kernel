import * as kernelErrors from '@metamask/kernel-errors';
import * as kernelUtils from '@metamask/kernel-utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { ConnectionFactory } from './connection-factory.ts';
import { MessageQueue } from './message-queue.ts';
import type { PeerRegistry } from './peer-registry.ts';
import { makeReconnectionOrchestrator } from './reconnection-orchestrator.ts';
import { ReconnectionManager } from './reconnection.ts';
import type { Channel, OnRemoteGiveUp } from '../types.ts';

// Mock abortableDelay to avoid real delays
vi.mock('@metamask/kernel-utils', async () => {
  const actual = await vi.importActual<typeof kernelUtils>(
    '@metamask/kernel-utils',
  );
  return {
    ...actual,
    abortableDelay: vi.fn().mockResolvedValue(undefined),
  };
});

// Mock isRetryableNetworkError
vi.mock('@metamask/kernel-errors', async () => {
  const actual = await vi.importActual<typeof kernelErrors>(
    '@metamask/kernel-errors',
  );
  return {
    ...actual,
    isRetryableNetworkError: vi.fn().mockReturnValue(true),
  };
});

function createMockChannel(peerId: string): Channel {
  return {
    peerId,
    msgStream: {
      read: vi.fn(),
      write: vi.fn(),
    },
  } as unknown as Channel;
}

function createMockLogger(): { log: ReturnType<typeof vi.fn> } {
  return { log: vi.fn() };
}

describe('makeReconnectionOrchestrator', () => {
  const peerId = 'peer1';
  let peerRegistry: PeerRegistry;
  let connectionFactory: ConnectionFactory;
  let reconnectionManager: ReconnectionManager;
  let registerChannel: ReturnType<typeof vi.fn>;
  let checkConnectionLimit: ReturnType<typeof vi.fn>;
  let writeWithTimeout: ReturnType<typeof vi.fn>;
  let outputError: ReturnType<typeof vi.fn>;
  let onRemoteGiveUp: OnRemoteGiveUp;
  let logger: { log: ReturnType<typeof vi.fn> };
  let abortController: AbortController;
  let queue: MessageQueue;

  // Mocked registry functions
  let getChannel: ReturnType<typeof vi.fn>;
  let hasChannel: ReturnType<typeof vi.fn>;
  let removeChannel: ReturnType<typeof vi.fn>;
  let isIntentionallyClosed: ReturnType<typeof vi.fn>;
  let getMessageQueue: ReturnType<typeof vi.fn>;
  let getLocationHints: ReturnType<typeof vi.fn>;

  // Mocked factory functions
  let dialIdempotent: ReturnType<typeof vi.fn>;
  let closeChannel: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mocks
    getChannel = vi.fn().mockReturnValue(undefined);
    hasChannel = vi.fn().mockReturnValue(true);
    removeChannel = vi.fn();
    isIntentionallyClosed = vi.fn().mockReturnValue(false);
    getMessageQueue = vi.fn();
    getLocationHints = vi.fn().mockReturnValue([]);

    peerRegistry = {
      getChannel,
      hasChannel,
      removeChannel,
      isIntentionallyClosed,
      getMessageQueue,
      getLocationHints,
    } as unknown as PeerRegistry;

    dialIdempotent = vi.fn();
    closeChannel = vi.fn().mockResolvedValue(undefined);

    connectionFactory = {
      dialIdempotent,
      closeChannel,
    } as unknown as ConnectionFactory;

    reconnectionManager = new ReconnectionManager();
    registerChannel = vi.fn();
    checkConnectionLimit = vi.fn();
    writeWithTimeout = vi.fn().mockResolvedValue(undefined);
    outputError = vi.fn();
    onRemoteGiveUp = vi.fn();
    logger = createMockLogger();
    abortController = new AbortController();

    queue = new MessageQueue(100);
    getMessageQueue.mockReturnValue(queue);
  });

  function createOrchestrator(maxRetryAttempts: number | undefined = 5) {
    return makeReconnectionOrchestrator({
      peerRegistry,
      connectionFactory,
      reconnectionManager,
      signal: abortController.signal,
      logger: logger as unknown as Parameters<
        typeof makeReconnectionOrchestrator
      >[0]['logger'],
      maxRetryAttempts,
      onRemoteGiveUp,
      registerChannel,
      checkConnectionLimit,
      writeWithTimeout,
      outputError,
    });
  }

  describe('handleConnectionLoss', () => {
    it('initiates reconnection for peer', () => {
      const orchestrator = createOrchestrator();

      orchestrator.handleConnectionLoss(peerId);

      expect(removeChannel).toHaveBeenCalledWith(peerId);
      expect(reconnectionManager.isReconnecting(peerId)).toBe(true);
    });

    it('skips reconnection for intentionally closed peer', () => {
      const orchestrator = createOrchestrator();
      isIntentionallyClosed.mockReturnValue(true);

      orchestrator.handleConnectionLoss(peerId);

      expect(removeChannel).not.toHaveBeenCalled();
      expect(reconnectionManager.isReconnecting(peerId)).toBe(false);
      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining('intentionally closed'),
      );
    });

    it('ignores loss from stale channel', () => {
      const orchestrator = createOrchestrator();
      const currentChannel = createMockChannel(peerId);
      const staleChannel = createMockChannel(peerId);
      getChannel.mockReturnValue(currentChannel);

      orchestrator.handleConnectionLoss(peerId, staleChannel);

      expect(removeChannel).not.toHaveBeenCalled();
      expect(reconnectionManager.isReconnecting(peerId)).toBe(false);
      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining('stale channel'),
      );
    });

    it('does not start reconnection if already reconnecting', () => {
      const orchestrator = createOrchestrator();
      reconnectionManager.startReconnection(peerId);

      orchestrator.handleConnectionLoss(peerId);

      // Should still be reconnecting but not double-start
      expect(reconnectionManager.isReconnecting(peerId)).toBe(true);
    });
  });

  describe('attemptReconnection', () => {
    beforeEach(() => {
      reconnectionManager.startReconnection(peerId);
    });

    it('successfully reconnects and registers channel', async () => {
      const orchestrator = createOrchestrator();
      const channel = createMockChannel(peerId);
      dialIdempotent.mockResolvedValue(channel);

      await orchestrator.attemptReconnection(peerId);

      expect(dialIdempotent).toHaveBeenCalled();
      expect(registerChannel).toHaveBeenCalledWith(peerId, channel);
      expect(reconnectionManager.isReconnecting(peerId)).toBe(false);
    });

    it('gives up after max retry attempts', async () => {
      const orchestrator = createOrchestrator(2);
      const error = new Error('Connection failed');
      dialIdempotent.mockRejectedValue(error);
      queue.enqueue('pending-msg');

      await orchestrator.attemptReconnection(peerId, 2);

      expect(onRemoteGiveUp).toHaveBeenCalledWith(peerId);
      expect(queue).toHaveLength(0); // Queue cleared
      expect(reconnectionManager.isReconnecting(peerId)).toBe(false);
    });

    it('gives up on non-retryable error', async () => {
      const orchestrator = createOrchestrator();
      const error = new Error('Non-retryable');
      dialIdempotent.mockRejectedValue(error);
      vi.mocked(kernelErrors.isRetryableNetworkError).mockReturnValue(false);
      queue.enqueue('pending-msg');

      await orchestrator.attemptReconnection(peerId);

      expect(onRemoteGiveUp).toHaveBeenCalledWith(peerId);
      expect(queue).toHaveLength(0);
    });

    it('stops reconnection when signal is aborted during delay', async () => {
      const orchestrator = createOrchestrator();
      vi.mocked(kernelUtils.abortableDelay).mockImplementation(async () => {
        if (abortController.signal.aborted) {
          throw new Error('Aborted');
        }
      });
      abortController.abort();

      await orchestrator.attemptReconnection(peerId);

      expect(reconnectionManager.isReconnecting(peerId)).toBe(false);
      expect(dialIdempotent).not.toHaveBeenCalled();
    });

    it('reuses existing channel when one appears during reconnection', async () => {
      const orchestrator = createOrchestrator();
      const dialedChannel = createMockChannel(peerId);
      const existingChannel = createMockChannel(peerId);
      dialIdempotent.mockResolvedValue(dialedChannel);

      // No channel initially, then existing channel after dial
      getChannel
        .mockReturnValueOnce(undefined) // Before dial
        .mockReturnValueOnce(existingChannel) // reuseOrReturnChannel first
        .mockReturnValueOnce(existingChannel) // reuseOrReturnChannel second
        .mockReturnValue(existingChannel); // After

      await orchestrator.attemptReconnection(peerId);

      expect(closeChannel).toHaveBeenCalledWith(dialedChannel, peerId);
      expect(registerChannel).not.toHaveBeenCalled();
    });
  });

  describe('flushQueuedMessages', () => {
    it('sends all queued messages', async () => {
      const orchestrator = createOrchestrator();
      const channel = createMockChannel(peerId);
      queue.enqueue('msg1');
      queue.enqueue('msg2');
      queue.enqueue('msg3');

      await orchestrator.flushQueuedMessages(peerId, channel, queue);

      expect(writeWithTimeout).toHaveBeenCalledTimes(3);
      expect(queue).toHaveLength(0);
    });

    it('preserves failed and remaining messages on error', async () => {
      const orchestrator = createOrchestrator();
      const channel = createMockChannel(peerId);
      queue.enqueue('msg1');
      queue.enqueue('msg2');
      queue.enqueue('msg3');

      writeWithTimeout
        .mockResolvedValueOnce(undefined) // msg1 succeeds
        .mockRejectedValueOnce(new Error('Send failed')); // msg2 fails

      await orchestrator.flushQueuedMessages(peerId, channel, queue);

      expect(queue).toHaveLength(2); // msg2 and msg3 preserved
      expect(queue.messages).toContain('msg2');
      expect(queue.messages).toContain('msg3');
    });

    it('triggers reconnection on flush failure', async () => {
      const orchestrator = createOrchestrator();
      const channel = createMockChannel(peerId);
      queue.enqueue('msg1');
      writeWithTimeout.mockRejectedValue(new Error('Send failed'));

      await orchestrator.flushQueuedMessages(peerId, channel, queue);

      // handleConnectionLoss should have been called
      expect(removeChannel).toHaveBeenCalled();
    });

    it('handles empty queue', async () => {
      const orchestrator = createOrchestrator();
      const channel = createMockChannel(peerId);

      await orchestrator.flushQueuedMessages(peerId, channel, queue);

      expect(writeWithTimeout).not.toHaveBeenCalled();
      expect(logger.log).toHaveBeenCalledWith(
        `${peerId}:: flushing 0 queued messages`,
      );
    });
  });

  describe('edge cases', () => {
    it('handles connection limit rejection during reconnection', async () => {
      const orchestrator = createOrchestrator();
      const channel = createMockChannel(peerId);
      reconnectionManager.startReconnection(peerId);
      dialIdempotent.mockResolvedValue(channel);

      // First attempt blocked by limit, second succeeds
      let attemptCount = 0;
      checkConnectionLimit.mockImplementation(() => {
        attemptCount += 1;
        if (attemptCount === 1) {
          throw new Error('Limit reached');
        }
      });

      await orchestrator.attemptReconnection(peerId);

      expect(closeChannel).toHaveBeenCalledWith(channel, peerId);
      expect(outputError).toHaveBeenCalled();
      // Eventually should succeed
      expect(registerChannel).toHaveBeenCalled();
    });

    it('stops reconnection when peer is intentionally closed during dial', async () => {
      const orchestrator = createOrchestrator();
      const channel = createMockChannel(peerId);
      reconnectionManager.startReconnection(peerId);
      dialIdempotent.mockResolvedValue(channel);

      // Mark as intentionally closed after dial
      isIntentionallyClosed.mockReturnValueOnce(false).mockReturnValue(true);

      await orchestrator.attemptReconnection(peerId);

      expect(closeChannel).toHaveBeenCalledWith(channel, peerId);
      expect(registerChannel).not.toHaveBeenCalled();
      expect(reconnectionManager.isReconnecting(peerId)).toBe(false);
    });

    it('supports infinite retries with maxAttempts 0', async () => {
      // Ensure retryable errors are treated as retryable
      vi.mocked(kernelErrors.isRetryableNetworkError).mockReturnValue(true);

      const orchestrator = createOrchestrator(0);
      const channel = createMockChannel(peerId);
      reconnectionManager.startReconnection(peerId);

      // Fail many times then succeed
      let attempts = 0;
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      dialIdempotent.mockImplementation(async () => {
        attempts += 1;
        if (attempts < 10) {
          throw new Error('Failed');
        }
        return channel;
      });

      await orchestrator.attemptReconnection(peerId, 0);

      expect(attempts).toBe(10);
      expect(registerChannel).toHaveBeenCalled();
    });
  });
});
