import { isRetryableNetworkError } from '@metamask/kernel-errors';
import {
  abortableDelay,
  DEFAULT_MAX_RETRY_ATTEMPTS,
} from '@metamask/kernel-utils';
import type { Logger } from '@metamask/logger';
import { fromString } from 'uint8arrays';

import type { ConnectionFactory } from './connection-factory.ts';
import type { MessageQueue } from './message-queue.ts';
import type { PeerRegistry } from './peer-registry.ts';
import { ReconnectionManager } from './reconnection.ts';
import type { Channel, OnRemoteGiveUp } from '../types.ts';

type ReconnectionOrchestratorDeps = {
  peerRegistry: PeerRegistry;
  connectionFactory: ConnectionFactory;
  reconnectionManager: ReconnectionManager;
  signal: AbortSignal;
  logger: Logger;
  maxRetryAttempts: number | undefined;
  onRemoteGiveUp: OnRemoteGiveUp | undefined;
  registerChannel: (peerId: string, channel: Channel) => void;
  checkConnectionLimit: () => void;
  writeWithTimeout: (
    channel: Channel,
    message: Uint8Array,
    timeoutMs?: number,
  ) => Promise<void>;
  outputError: (peerId: string, task: string, problem: unknown) => void;
};

/**
 * Creates a reconnection orchestrator that manages peer reconnection attempts.
 *
 * @param deps - Dependencies for the orchestrator.
 * @returns Object with methods for handling connection loss and reconnection.
 */
export function makeReconnectionOrchestrator(
  deps: ReconnectionOrchestratorDeps,
): {
  handleConnectionLoss: (peerId: string, channel?: Channel) => void;
  attemptReconnection: (peerId: string, maxAttempts?: number) => Promise<void>;
  flushQueuedMessages: (
    peerId: string,
    channel: Channel,
    queue: MessageQueue,
  ) => Promise<void>;
} {
  const {
    peerRegistry,
    connectionFactory,
    reconnectionManager,
    signal,
    logger,
    maxRetryAttempts,
    onRemoteGiveUp,
    registerChannel,
    checkConnectionLimit,
    writeWithTimeout,
    outputError,
  } = deps;

  /**
   * Give up on a peer after max retries or non-retryable error.
   *
   * @param peerId - The peer ID to give up on.
   * @param queue - The message queue for the peer.
   */
  function giveUpOnPeer(peerId: string, queue: MessageQueue): void {
    reconnectionManager.stopReconnection(peerId);
    queue.clear();
    onRemoteGiveUp?.(peerId);
  }

  /**
   * Flush queued messages after reconnection.
   *
   * @param peerId - The peer ID to flush messages for.
   * @param channel - The channel to flush messages through.
   * @param queue - The message queue to flush.
   */
  async function flushQueuedMessages(
    peerId: string,
    channel: Channel,
    queue: MessageQueue,
  ): Promise<void> {
    logger.log(`${peerId}:: flushing ${queue.length} queued messages`);

    // Process queued messages
    const failedMessages: string[] = [];
    let queuedMsg: string | undefined;

    while ((queuedMsg = queue.dequeue()) !== undefined) {
      try {
        logger.log(`${peerId}:: send (queued) ${queuedMsg}`);
        await writeWithTimeout(channel, fromString(queuedMsg), 10_000);
      } catch (problem) {
        outputError(peerId, `sending queued message`, problem);
        // Preserve the failed message and all remaining messages
        failedMessages.push(queuedMsg);
        failedMessages.push(...queue.dequeueAll());
        break;
      }
    }

    // Re-queue any failed messages
    if (failedMessages.length > 0) {
      queue.replaceAll(failedMessages);
      handleConnectionLoss(peerId, channel);
    }
  }

  /**
   * Check if an existing channel exists for a peer, and if so, reuse it.
   * Otherwise, return the dialed channel for the caller to register.
   *
   * @param peerId - The peer ID for the channel.
   * @param dialedChannel - The newly dialed channel.
   * @returns The channel to use, or null if existing channel died and dialed was closed.
   */
  async function reuseOrReturnChannel(
    peerId: string,
    dialedChannel: Channel,
  ): Promise<Channel | null> {
    const existingChannel = peerRegistry.getChannel(peerId);
    if (existingChannel) {
      if (dialedChannel !== existingChannel) {
        await connectionFactory.closeChannel(dialedChannel, peerId);
        const currentChannel = peerRegistry.getChannel(peerId);
        if (currentChannel === existingChannel) {
          return existingChannel;
        }
        if (currentChannel) {
          return currentChannel;
        }
        return null;
      }
      const currentChannel = peerRegistry.getChannel(peerId);
      if (currentChannel === existingChannel) {
        return existingChannel;
      }
      if (currentChannel) {
        return currentChannel;
      }
      return null;
    }
    return dialedChannel;
  }

  /**
   * Handle connection loss for a given peer ID.
   * Skips reconnection if the peer was intentionally closed.
   *
   * @param peerId - The peer ID to handle the connection loss for.
   * @param channel - Optional channel that experienced loss; used to ignore stale channels.
   */
  function handleConnectionLoss(peerId: string, channel?: Channel): void {
    const currentChannel = peerRegistry.getChannel(peerId);
    // Ignore loss signals from stale channels if a different channel is active.
    if (channel && currentChannel && currentChannel !== channel) {
      logger.log(`${peerId}:: ignoring connection loss from stale channel`);
      return;
    }
    // Don't reconnect if this peer intentionally closed the connection
    if (peerRegistry.isIntentionallyClosed(peerId)) {
      logger.log(
        `${peerId}:: connection lost but peer intentionally closed, skipping reconnection`,
      );
      return;
    }
    logger.log(`${peerId}:: connection lost, initiating reconnection`);
    peerRegistry.removeChannel(peerId);
    if (!reconnectionManager.isReconnecting(peerId)) {
      reconnectionManager.startReconnection(peerId);
      attemptReconnection(peerId).catch((problem) => {
        outputError(peerId, 'reconnection error', problem);
        reconnectionManager.stopReconnection(peerId);
      });
    }
  }

  /**
   * Attempt to reconnect to a peer after connection loss.
   * Single orchestration loop per peer; abortable.
   *
   * @param peerId - The peer ID to reconnect to.
   * @param maxAttempts - The maximum number of reconnection attempts. 0 = infinite.
   */
  async function attemptReconnection(
    peerId: string,
    maxAttempts = maxRetryAttempts ?? DEFAULT_MAX_RETRY_ATTEMPTS,
  ): Promise<void> {
    let queue = peerRegistry.getMessageQueue(peerId);

    while (reconnectionManager.isReconnecting(peerId) && !signal.aborted) {
      if (!reconnectionManager.shouldRetry(peerId, maxAttempts)) {
        logger.log(
          `${peerId}:: max reconnection attempts (${maxAttempts}) reached, giving up`,
        );
        giveUpOnPeer(peerId, queue);
        return;
      }

      const nextAttempt = reconnectionManager.incrementAttempt(peerId);
      const delayMs = reconnectionManager.calculateBackoff(peerId);
      logger.log(
        `${peerId}:: scheduling reconnection attempt ${nextAttempt}${maxAttempts ? `/${maxAttempts}` : ''} in ${delayMs}ms`,
      );

      try {
        await abortableDelay(delayMs, signal);
      } catch (error) {
        if (signal.aborted) {
          reconnectionManager.stopReconnection(peerId);
          return;
        }
        throw error;
      }

      // Re-fetch queue after delay in case cleanupStalePeers deleted it
      queue = peerRegistry.getMessageQueue(peerId);

      if (!reconnectionManager.isReconnecting(peerId) || signal.aborted) {
        return;
      }

      if (peerRegistry.isIntentionallyClosed(peerId)) {
        reconnectionManager.stopReconnection(peerId);
        return;
      }

      logger.log(
        `${peerId}:: reconnection attempt ${nextAttempt}${maxAttempts ? `/${maxAttempts}` : ''}`,
      );

      try {
        const hints = peerRegistry.getLocationHints(peerId);
        let channel: Channel | null = await connectionFactory.dialIdempotent(
          peerId,
          hints,
          false,
        );

        queue = peerRegistry.getMessageQueue(peerId);

        channel = await reuseOrReturnChannel(peerId, channel);
        if (channel === null) {
          logger.log(
            `${peerId}:: existing channel died during reuse check, continuing reconnection loop`,
          );
          continue;
        }

        const registeredChannel = peerRegistry.getChannel(peerId);
        if (registeredChannel) {
          if (channel !== registeredChannel) {
            await connectionFactory.closeChannel(channel, peerId);
          }
          channel = registeredChannel;
          logger.log(
            `${peerId}:: reconnection: channel already exists, reusing existing channel`,
          );
        } else {
          try {
            checkConnectionLimit();
          } catch (limitError) {
            logger.log(
              `${peerId}:: reconnection blocked by connection limit, will retry`,
            );
            outputError(
              peerId,
              `reconnection attempt ${nextAttempt}`,
              limitError,
            );
            await connectionFactory.closeChannel(channel, peerId);
            continue;
          }

          if (peerRegistry.isIntentionallyClosed(peerId)) {
            logger.log(
              `${peerId}:: peer intentionally closed during dial, closing channel`,
            );
            await connectionFactory.closeChannel(channel, peerId);
            reconnectionManager.stopReconnection(peerId);
            return;
          }

          registerChannel(peerId, channel);
        }

        logger.log(`${peerId}:: reconnection successful`);

        await flushQueuedMessages(peerId, channel, queue);

        if (!peerRegistry.hasChannel(peerId)) {
          logger.log(
            `${peerId}:: channel deleted during flush, continuing loop`,
          );
          continue;
        }

        const newChannel = peerRegistry.getChannel(peerId);
        if (newChannel && newChannel !== channel) {
          logger.log(
            `${peerId}:: stale channel replaced during flush, flushing queue on new channel`,
          );
          await flushQueuedMessages(peerId, newChannel, queue);
          if (!peerRegistry.hasChannel(peerId)) {
            logger.log(
              `${peerId}:: new channel also failed during flush, continuing loop`,
            );
            continue;
          }
        }

        reconnectionManager.resetBackoff(peerId);
        reconnectionManager.stopReconnection(peerId);
        return;
      } catch (problem) {
        if (signal.aborted) {
          reconnectionManager.stopReconnection(peerId);
          return;
        }
        if (!isRetryableNetworkError(problem)) {
          outputError(peerId, `non-retryable failure`, problem);
          giveUpOnPeer(peerId, queue);
          return;
        }
        outputError(peerId, `reconnection attempt ${nextAttempt}`, problem);
      }
    }

    if (reconnectionManager.isReconnecting(peerId)) {
      reconnectionManager.stopReconnection(peerId);
    }
  }

  return {
    handleConnectionLoss,
    attemptReconnection,
    flushQueuedMessages,
  };
}
