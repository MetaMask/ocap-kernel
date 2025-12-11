import { AbortError, isRetryableNetworkError } from '@metamask/kernel-errors';
import {
  abortableDelay,
  DEFAULT_MAX_RETRY_ATTEMPTS,
  installWakeDetector,
} from '@metamask/kernel-utils';
import { Logger } from '@metamask/logger';
import { toString as bufToString, fromString } from 'uint8arrays';

import { ConnectionFactory } from './ConnectionFactory.ts';
import { MessageQueue } from './MessageQueue.ts';
import type { QueuedMessage } from './MessageQueue.ts';
import { ReconnectionManager } from './ReconnectionManager.ts';
import type {
  RemoteMessageHandler,
  SendRemoteMessage,
  StopRemoteComms,
  Channel,
  OnRemoteGiveUp,
  RemoteCommsOptions,
} from './types.ts';

/** Default upper bound for queued outbound messages while reconnecting */
const DEFAULT_MAX_QUEUE = 200;

/**
 * Initialize the remote comm system with information that must be provided by the kernel.
 *
 * @param keySeed - Seed value for key generation, in the form of a hex-encoded string.
 * @param options - Options for remote communications initialization.
 * @param options.relays - PeerIds/Multiaddrs of known message relays.
 * @param options.maxRetryAttempts - Maximum number of reconnection attempts. 0 = infinite (default).
 * @param options.maxQueue - Maximum number of messages to queue per peer while reconnecting (default: 200).
 * @param remoteMessageHandler - Handler to be called when messages are received from elsewhere.
 * @param onRemoteGiveUp - Optional callback to be called when we give up on a remote (after max retries or non-retryable error).
 *
 * @returns a function to send messages **and** a `stop()` to cancel/release everything.
 */
export async function initNetwork(
  keySeed: string,
  options: RemoteCommsOptions,
  remoteMessageHandler: RemoteMessageHandler,
  onRemoteGiveUp?: OnRemoteGiveUp,
): Promise<{
  sendRemoteMessage: SendRemoteMessage;
  stop: StopRemoteComms;
  closeConnection: (peerId: string) => Promise<void>;
  registerLocationHints: (peerId: string, hints: string[]) => void;
  reconnectPeer: (peerId: string, hints?: string[]) => Promise<void>;
}> {
  const {
    relays = [],
    maxRetryAttempts,
    maxQueue = DEFAULT_MAX_QUEUE,
  } = options;
  let cleanupWakeDetector: (() => void) | undefined;
  const stopController = new AbortController();
  const { signal } = stopController;
  const logger = new Logger();
  const channels = new Map<string, Channel>();
  const reconnectionManager = new ReconnectionManager();
  const messageQueues = new Map<string, MessageQueue>(); // One queue per peer
  const intentionallyClosed = new Set<string>(); // Track peers that intentionally closed connections
  const connectionFactory = await ConnectionFactory.make(
    keySeed,
    relays,
    logger,
    signal,
    maxRetryAttempts,
  );
  const locationHints = new Map<string, string[]>();
  /**
   * Output an error message.
   *
   * @param peerId - The peer ID that the error is associated with.
   * @param task - The task that the error is associated with.
   * @param problem - The error itself.
   */
  function outputError(peerId: string, task: string, problem: unknown): void {
    if (problem) {
      const realProblem: Error = problem as Error;
      logger.log(`${peerId}:: error ${task}: ${realProblem}`);
    } else {
      logger.log(`${peerId}:: error ${task}`);
    }
  }

  /**
   * Get or create a message queue for a peer.
   *
   * @param peerId - The peer ID to get the queue for.
   * @returns The message queue for the peer.
   */
  function getMessageQueue(peerId: string): MessageQueue {
    let queue = messageQueues.get(peerId);
    if (!queue) {
      queue = new MessageQueue(maxQueue);
      messageQueues.set(peerId, queue);
    }
    return queue;
  }

  /**
   * Receive a message from a peer.
   *
   * @param from - The peer ID that the message is from.
   * @param message - The message to receive.
   */
  async function receiveMsg(from: string, message: string): Promise<void> {
    logger.log(`${from}:: recv ${message}`);
    await remoteMessageHandler(from, message);
  }

  /**
   * Start reading (and processing) messages arriving on a channel.
   *
   * @param channel - The channel to read from.
   */
  async function readChannel(channel: Channel): Promise<void> {
    const SCTP_USER_INITIATED_ABORT = 12; // RFC 4960
    try {
      for (;;) {
        if (signal.aborted) {
          logger.log(`reader abort: ${channel.peerId}`);
          throw new AbortError();
        }
        let readBuf;
        try {
          readBuf = await channel.msgStream.read();
        } catch (problem) {
          // Detect graceful disconnect
          const rtcProblem = problem as {
            errorDetail?: string;
            sctpCauseCode?: number;
          };
          if (
            rtcProblem?.errorDetail === 'sctp-failure' &&
            rtcProblem?.sctpCauseCode === SCTP_USER_INITIATED_ABORT
          ) {
            logger.log(`${channel.peerId}:: remote intentionally disconnected`);
            // Mark as intentionally closed and don't trigger reconnection
            intentionallyClosed.add(channel.peerId);
          } else {
            outputError(
              channel.peerId,
              `reading message from ${channel.peerId}`,
              problem,
            );
            // Only trigger reconnection for non-intentional disconnects
            handleConnectionLoss(channel.peerId);
          }
          logger.log(`closed channel to ${channel.peerId}`);
          throw problem;
        }
        if (readBuf) {
          reconnectionManager.resetBackoff(channel.peerId); // successful inbound traffic
          await receiveMsg(channel.peerId, bufToString(readBuf.subarray()));
        } else {
          // Stream ended (returned undefined), exit the read loop
          logger.log(`${channel.peerId}:: stream ended`);
          break;
        }
      }
    } finally {
      // Always remove the channel when readChannel exits to prevent stale channels
      // This ensures that subsequent sends will establish a new connection
      if (channels.get(channel.peerId) === channel) {
        channels.delete(channel.peerId);
      }
    }
  }

  /**
   * Handle connection loss for a given peer ID.
   * Skips reconnection if the peer was intentionally closed.
   *
   * @param peerId - The peer ID to handle the connection loss for.
   */
  function handleConnectionLoss(peerId: string): void {
    // Don't reconnect if this peer intentionally closed the connection
    if (intentionallyClosed.has(peerId)) {
      logger.log(
        `${peerId}:: connection lost but peer intentionally closed, skipping reconnection`,
      );
      return;
    }
    logger.log(`${peerId}:: connection lost, initiating reconnection`);
    channels.delete(peerId);
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
    const queue = getMessageQueue(peerId);

    while (reconnectionManager.isReconnecting(peerId) && !signal.aborted) {
      if (!reconnectionManager.shouldRetry(peerId, maxAttempts)) {
        logger.log(
          `${peerId}:: max reconnection attempts (${maxAttempts}) reached, giving up`,
        );
        reconnectionManager.stopReconnection(peerId);
        queue.clear();
        onRemoteGiveUp?.(peerId);
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

      logger.log(
        `${peerId}:: reconnection attempt ${nextAttempt}${maxAttempts ? `/${maxAttempts}` : ''}`,
      );

      try {
        const hints = locationHints.get(peerId) ?? [];
        const channel = await connectionFactory.dialIdempotent(
          peerId,
          hints,
          false, // No retry here, we're already in a retry loop
        );

        // Add channel to manager
        channels.set(peerId, channel);

        logger.log(`${peerId}:: reconnection successful`);

        // Start reading from the new channel
        readChannel(channel).catch((problem) => {
          outputError(peerId, `reading channel to`, problem);
        });

        // Flush queued messages
        await flushQueuedMessages(peerId, channel, queue);

        // Check if channel was deleted during flush (e.g., due to flush errors)
        if (!channels.has(peerId)) {
          logger.log(
            `${peerId}:: channel deleted during flush, continuing loop`,
          );
          continue; // Continue the reconnection loop
        }

        // Only reset backoff and stop reconnection after successful flush
        reconnectionManager.resetBackoff(peerId);
        reconnectionManager.stopReconnection(peerId);
        return; // success
      } catch (problem) {
        if (signal.aborted) {
          reconnectionManager.stopReconnection(peerId);
          return;
        }
        if (!isRetryableNetworkError(problem)) {
          outputError(peerId, `non-retryable failure`, problem);
          reconnectionManager.stopReconnection(peerId);
          queue.clear();
          onRemoteGiveUp?.(peerId);
          return;
        }
        outputError(peerId, `reconnection attempt ${nextAttempt}`, problem);
        // loop to next attempt
      }
    }
    // Loop exited - clean up reconnection state
    if (reconnectionManager.isReconnecting(peerId)) {
      reconnectionManager.stopReconnection(peerId);
    }
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
    const failedMessages: QueuedMessage[] = [];
    let queuedMsg: QueuedMessage | undefined;

    while ((queuedMsg = queue.dequeue()) !== undefined) {
      try {
        logger.log(`${peerId}:: send (queued) ${queuedMsg.message}`);
        await channel.msgStream.write(fromString(queuedMsg.message));
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
      handleConnectionLoss(peerId);
    }
  }

  /**
   * Send a message to a peer.
   *
   * @param targetPeerId - The peer ID to send the message to.
   * @param message - The message to send.
   */
  async function sendRemoteMessage(
    targetPeerId: string,
    message: string,
  ): Promise<void> {
    if (signal.aborted) {
      return;
    }

    // Check if peer is intentionally closed
    if (intentionallyClosed.has(targetPeerId)) {
      throw new Error('Message delivery failed after intentional close');
    }

    const queue = getMessageQueue(targetPeerId);

    if (reconnectionManager.isReconnecting(targetPeerId)) {
      queue.enqueue(message);
      logger.log(
        `${targetPeerId}:: queueing message during reconnection ` +
          `(${queue.length}/${maxQueue}): ${message}`,
      );
      return;
    }

    let channel = channels.get(targetPeerId);
    if (!channel) {
      try {
        const hints = locationHints.get(targetPeerId) ?? [];
        channel = await connectionFactory.dialIdempotent(
          targetPeerId,
          hints,
          true, // With retry for initial connection
        );

        // Check if reconnection started while we were dialing (race condition protection)
        if (reconnectionManager.isReconnecting(targetPeerId)) {
          queue.enqueue(message);
          logger.log(
            `${targetPeerId}:: reconnection started during dial, queueing message ` +
              `(${queue.length}/${maxQueue}): ${message}`,
          );
          return;
        }

        channels.set(targetPeerId, channel);
      } catch (problem) {
        outputError(targetPeerId, `opening connection`, problem);
        handleConnectionLoss(targetPeerId);
        queue.enqueue(message);
        return;
      }

      readChannel(channel).catch((problem) => {
        outputError(targetPeerId, `reading channel to`, problem);
      });
    }

    try {
      logger.log(`${targetPeerId}:: send ${message}`);
      await channel.msgStream.write(fromString(message));
      reconnectionManager.resetBackoff(targetPeerId);
    } catch (problem) {
      outputError(targetPeerId, `sending message`, problem);
      handleConnectionLoss(targetPeerId);
      queue.enqueue(message);
    }
  }

  /**
   * Handle wake from sleep event.
   */
  function handleWakeFromSleep(): void {
    logger.log('Wake from sleep detected, resetting reconnection backoffs');
    reconnectionManager.resetAllBackoffs();
  }

  // Set up inbound connection handler
  connectionFactory.onInboundConnection((channel) => {
    // Reject inbound connections from intentionally closed peers
    if (intentionallyClosed.has(channel.peerId)) {
      logger.log(
        `${channel.peerId}:: rejecting inbound connection from intentionally closed peer`,
      );
      // Don't add to channels map and don't start reading - connection will naturally close
      return;
    }
    channels.set(channel.peerId, channel);
    readChannel(channel).catch((error) => {
      outputError(channel.peerId, 'error in inbound channel read', error);
    });
  });

  // Install wake detector to reset backoff on sleep/wake
  cleanupWakeDetector = installWakeDetector(handleWakeFromSleep);

  /**
   * Explicitly close a connection to a peer.
   * Marks the peer as intentionally closed to prevent automatic reconnection.
   *
   * @param peerId - The peer ID to close the connection for.
   */
  async function closeConnection(peerId: string): Promise<void> {
    logger.log(`${peerId}:: explicitly closing connection`);
    intentionallyClosed.add(peerId);
    // Remove channel - the readChannel cleanup will handle stream closure
    channels.delete(peerId);
    // Stop any ongoing reconnection attempts
    if (reconnectionManager.isReconnecting(peerId)) {
      reconnectionManager.stopReconnection(peerId);
    }
    // Clear any queued messages
    const queue = messageQueues.get(peerId);
    if (queue) {
      queue.clear();
    }
  }

  /**
   * Take note of where a peer might be.
   *
   * @param peerId - The peer ID to which this information applies.
   * @param hints - Location hints for the peer.
   */
  function registerLocationHints(peerId: string, hints: string[]): void {
    const oldHints = locationHints.get(peerId);
    if (oldHints) {
      const newHints = new Set(oldHints);
      for (const hint of hints) {
        newHints.add(hint);
      }
      locationHints.set(peerId, Array.from(newHints));
    } else {
      locationHints.set(peerId, hints);
    }
  }

  /**
   * Manually reconnect to a peer after intentional close.
   * Clears the intentional close flag and initiates reconnection.
   *
   * @param peerId - The peer ID to reconnect to.
   * @param hints - The hints to use for the reconnection.
   */
  async function reconnectPeer(
    peerId: string,
    hints: string[] = [],
  ): Promise<void> {
    logger.log(`${peerId}:: manually reconnecting after intentional close`);
    intentionallyClosed.delete(peerId);
    // If already reconnecting, don't start another attempt
    if (reconnectionManager.isReconnecting(peerId)) {
      return;
    }
    registerLocationHints(peerId, hints);
    handleConnectionLoss(peerId);
  }

  /**
   * Stop the network.
   */
  async function stop(): Promise<void> {
    logger.log('Stopping kernel network...');
    // Stop wake detector
    if (cleanupWakeDetector) {
      cleanupWakeDetector();
      cleanupWakeDetector = undefined;
    }
    stopController.abort(); // cancels all delays and dials
    await connectionFactory.stop();
    channels.clear();
    reconnectionManager.clear();
    messageQueues.clear();
    intentionallyClosed.clear();
  }

  // Return the sender with a stop handle and connection management functions
  return {
    sendRemoteMessage,
    stop,
    closeConnection,
    registerLocationHints,
    reconnectPeer,
  };
}
