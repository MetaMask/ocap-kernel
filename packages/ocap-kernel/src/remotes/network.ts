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
} from './types.ts';

/** Upper bound for queued outbound messages while reconnecting */
const MAX_QUEUE = 200;

/**
 * Initialize the remote comm system with information that must be provided by the kernel.
 *
 * @param keySeed - Seed value for key generation, in the form of a hex-encoded string.
 * @param knownRelays - PeerIds/Multiaddrs of known message relays.
 * @param remoteMessageHandler - Handler to be called when messages are received from elsewhere.
 *
 * @returns a function to send messages **and** a `stop()` to cancel/release everything.
 */
export async function initNetwork(
  keySeed: string,
  knownRelays: string[],
  remoteMessageHandler: RemoteMessageHandler,
): Promise<{
  sendRemoteMessage: SendRemoteMessage;
  stop: StopRemoteComms;
}> {
  let cleanupWakeDetector: (() => void) | undefined;
  const stopController = new AbortController();
  const { signal } = stopController;
  const logger = new Logger();
  const channels = new Map<string, Channel>();
  const reconnectionManager = new ReconnectionManager();
  const messageQueues = new Map<string, MessageQueue>(); // One queue per peer
  const connectionFactory = await ConnectionFactory.make(
    keySeed,
    knownRelays,
    logger,
    signal,
  );

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
   * Update channel hints by merging new hints without duplicates.
   *
   * @param peerId - The peer ID to update hints for.
   * @param newHints - The new hints to add.
   */
  function updateChannelHints(peerId: string, newHints: string[]): void {
    const channel = channels.get(peerId);
    if (channel) {
      const allHints = new Set(channel.hints);
      for (const hint of newHints) {
        allHints.add(hint);
      }
      channel.hints = Array.from(allHints);
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
      queue = new MessageQueue(MAX_QUEUE);
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
          logger.log(`${channel.peerId}:: remote disconnected`);
        } else {
          outputError(
            channel.peerId,
            `reading message from ${channel.peerId}`,
            problem,
          );
        }
        logger.log(`closed channel to ${channel.peerId}`);
        handleConnectionLoss(channel.peerId, channel.hints);
        throw problem;
      }
      if (readBuf) {
        reconnectionManager.resetBackoff(channel.peerId); // successful inbound traffic
        await receiveMsg(channel.peerId, bufToString(readBuf.subarray()));
      }
    }
  }

  /**
   * Handle connection loss for a given peer ID.
   *
   * @param peerId - The peer ID to handle the connection loss for.
   * @param hints - The hints to use for the connection loss.
   */
  function handleConnectionLoss(peerId: string, hints: string[] = []): void {
    logger.log(`${peerId}:: connection lost, initiating reconnection`);
    channels.delete(peerId);
    if (!reconnectionManager.isReconnecting(peerId)) {
      reconnectionManager.startReconnection(peerId);
      attemptReconnection(peerId, hints).catch((problem) => {
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
   * @param hints - The hints to use for the reconnection.
   * @param maxAttempts - The maximum number of reconnection attempts. 0 = infinite.
   */
  async function attemptReconnection(
    peerId: string,
    hints: string[] = [],
    maxAttempts = DEFAULT_MAX_RETRY_ATTEMPTS,
  ): Promise<void> {
    const queue = getMessageQueue(peerId);

    while (reconnectionManager.isReconnecting(peerId) && !signal.aborted) {
      if (!reconnectionManager.shouldRetry(peerId, maxAttempts)) {
        logger.log(
          `${peerId}:: max reconnection attempts (${maxAttempts}) reached, giving up`,
        );
        reconnectionManager.stopReconnection(peerId);
        queue.clear();
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
          return;
        }
        throw error;
      }

      logger.log(
        `${peerId}:: reconnection attempt ${nextAttempt}${maxAttempts ? `/${maxAttempts}` : ''}`,
      );

      try {
        const channel = await connectionFactory.dialIdempotent(
          peerId,
          hints,
          false, // No retry here, we're already in a retry loop
        );

        // Add channel to manager
        channels.set(peerId, channel);

        logger.log(`${peerId}:: reconnection successful`);

        // Reset reconnection state
        reconnectionManager.stopReconnection(peerId);
        reconnectionManager.resetBackoff(peerId);

        // Start reading from the new channel
        readChannel(channel).catch((problem) => {
          outputError(peerId, `reading channel to`, problem);
        });

        // Flush queued messages
        await flushQueuedMessages(peerId, channel, queue);

        // Check if reconnection was restarted during flush (e.g., due to flush errors)
        if (reconnectionManager.isReconnecting(peerId)) {
          logger.log(
            `${peerId}:: reconnection restarted during flush, continuing loop`,
          );
          continue; // Continue the reconnection loop
        }

        return; // success
      } catch (problem) {
        if (signal.aborted) {
          return;
        }
        if (!isRetryableNetworkError(problem)) {
          outputError(peerId, `non-retryable failure`, problem);
          reconnectionManager.stopReconnection(peerId);
          queue.clear();
          return;
        }
        outputError(peerId, `reconnection attempt ${nextAttempt}`, problem);
        // loop to next attempt
      }
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

    // Update channel hints with any unique hints from queued messages
    const allHints = new Set(channel.hints);
    for (const queuedMsg of queue.messages) {
      for (const hint of queuedMsg.hints) {
        allHints.add(hint);
      }
    }
    channel.hints = Array.from(allHints);
    updateChannelHints(peerId, channel.hints);

    // Process queued messages
    const failedMessages: QueuedMessage[] = [];
    let queuedMsg: QueuedMessage | undefined;

    while ((queuedMsg = queue.dequeue()) !== undefined) {
      try {
        logger.log(`${peerId}:: send (queued) ${queuedMsg.message}`);
        await channel.msgStream.write(fromString(queuedMsg.message));
        reconnectionManager.resetBackoff(peerId);
      } catch (problem) {
        outputError(peerId, `sending queued message`, problem);
        // Preserve the failed message and all remaining messages
        failedMessages.push(queuedMsg);
        failedMessages.push(...queue.dequeueAll());
        break;
      }
    }

    // Re-queue any failed messages with their original hints
    if (failedMessages.length > 0) {
      queue.replaceAll(failedMessages);
      handleConnectionLoss(peerId, channel.hints);
    }
  }

  /**
   * Send a message to a peer.
   *
   * @param targetPeerId - The peer ID to send the message to.
   * @param message - The message to send.
   * @param hints - The hints to use for the message.
   */
  async function sendRemoteMessage(
    targetPeerId: string,
    message: string,
    hints: string[] = [],
  ): Promise<void> {
    if (signal.aborted) {
      return;
    }

    const queue = getMessageQueue(targetPeerId);

    if (reconnectionManager.isReconnecting(targetPeerId)) {
      queue.enqueue(message, hints);
      logger.log(
        `${targetPeerId}:: queueing message during reconnection ` +
          `(${queue.length}/${MAX_QUEUE}): ${message}`,
      );
      return;
    }

    let channel = channels.get(targetPeerId);
    if (!channel) {
      try {
        channel = await connectionFactory.dialIdempotent(
          targetPeerId,
          hints,
          true, // With retry for initial connection
        );

        // Check if reconnection started while we were dialing (race condition protection)
        if (reconnectionManager.isReconnecting(targetPeerId)) {
          queue.enqueue(message, hints);
          logger.log(
            `${targetPeerId}:: reconnection started during dial, queueing message ` +
              `(${queue.length}/${MAX_QUEUE}): ${message}`,
          );
          return;
        }

        channels.set(targetPeerId, channel);
      } catch (problem) {
        outputError(targetPeerId, `opening connection`, problem);
        handleConnectionLoss(targetPeerId, hints);
        queue.enqueue(message, hints);
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
      handleConnectionLoss(targetPeerId, hints);
      queue.enqueue(message, hints);
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
    channels.set(channel.peerId, channel);
    readChannel(channel).catch((error) => {
      outputError(channel.peerId, 'error in inbound channel read', error);
    });
  });

  // Install wake detector to reset backoff on sleep/wake
  cleanupWakeDetector = installWakeDetector(handleWakeFromSleep);

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
  }

  // Return the sender with a stop handle
  return { sendRemoteMessage, stop };
}
