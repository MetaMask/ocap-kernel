import {
  AbortError,
  isRetryableNetworkError,
  ResourceLimitError,
} from '@metamask/kernel-errors';
import {
  abortableDelay,
  DEFAULT_MAX_RETRY_ATTEMPTS,
  installWakeDetector,
} from '@metamask/kernel-utils';
import { Logger } from '@metamask/logger';
import { toString as bufToString, fromString } from 'uint8arrays';

import { ConnectionFactory } from './ConnectionFactory.ts';
import { MessageQueue } from './MessageQueue.ts';
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

/** Default maximum number of concurrent connections */
const DEFAULT_MAX_CONCURRENT_CONNECTIONS = 100;

/** Default maximum message size in bytes (1MB) */
const DEFAULT_MAX_MESSAGE_SIZE_BYTES = 1024 * 1024;

/** Default stale peer cleanup interval in milliseconds (15 minutes) */
const DEFAULT_CLEANUP_INTERVAL_MS = 15 * 60 * 1000;

/** Default stale peer timeout in milliseconds (1 hour) */
const DEFAULT_STALE_PEER_TIMEOUT_MS = 60 * 60 * 1000;

/**
 * Initialize the remote comm system with information that must be provided by the kernel.
 *
 * @param keySeed - Seed value for key generation, in the form of a hex-encoded string.
 * @param options - Options for remote communications initialization.
 * @param options.relays - PeerIds/Multiaddrs of known message relays.
 * @param options.maxRetryAttempts - Maximum number of reconnection attempts. 0 = infinite (default).
 * @param options.maxQueue - Maximum number of messages to queue per peer while reconnecting (default: 200).
 * @param options.maxConcurrentConnections - Maximum number of concurrent connections (default: 100).
 * @param options.maxMessageSizeBytes - Maximum message size in bytes (default: 1MB).
 * @param options.cleanupIntervalMs - Stale peer cleanup interval in milliseconds (default: 15 minutes).
 * @param options.stalePeerTimeoutMs - Stale peer timeout in milliseconds (default: 1 hour).
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
    maxConcurrentConnections = DEFAULT_MAX_CONCURRENT_CONNECTIONS,
    maxMessageSizeBytes = DEFAULT_MAX_MESSAGE_SIZE_BYTES,
    cleanupIntervalMs = DEFAULT_CLEANUP_INTERVAL_MS,
    stalePeerTimeoutMs = DEFAULT_STALE_PEER_TIMEOUT_MS,
  } = options;
  let cleanupWakeDetector: (() => void) | undefined;
  const stopController = new AbortController();
  const { signal } = stopController;
  const logger = new Logger();
  const channels = new Map<string, Channel>();
  const reconnectionManager = new ReconnectionManager();
  const messageQueues = new Map<string, MessageQueue>(); // One queue per peer
  const intentionallyClosed = new Set<string>(); // Track peers that intentionally closed connections
  const lastConnectionTime = new Map<string, number>(); // Track last connection time for cleanup
  const connectionFactory = await ConnectionFactory.make(
    keySeed,
    relays,
    logger,
    signal,
    maxRetryAttempts,
  );
  const locationHints = new Map<string, string[]>();
  let cleanupIntervalId: ReturnType<typeof setInterval> | undefined;

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
   * Write a message to a channel stream with a timeout.
   *
   * @param channel - The channel to write to.
   * @param message - The message bytes to write.
   * @param timeoutMs - Timeout in milliseconds (default: 10 seconds).
   * @returns Promise that resolves when the write completes or rejects on timeout.
   * @throws Error if the write times out or fails.
   */
  async function writeWithTimeout(
    channel: Channel,
    message: Uint8Array,
    timeoutMs = 10_000,
  ): Promise<void> {
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    let abortHandler: (() => void) | undefined;
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      abortHandler = () => {
        reject(new Error(`Message send timed out after ${timeoutMs}ms`));
      };
      timeoutSignal.addEventListener('abort', abortHandler);
    });

    try {
      return await Promise.race([
        channel.msgStream.write(message),
        timeoutPromise,
      ]);
    } finally {
      // Clean up event listener to prevent unhandled rejection if operation
      // completes before timeout
      if (abortHandler) {
        timeoutSignal.removeEventListener('abort', abortHandler);
      }
    }
  }

  /**
   * Receive a message from a peer.
   *
   * @param from - The peer ID that the message is from.
   * @param message - The message to receive.
   */
  async function receiveMessage(from: string, message: string): Promise<void> {
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
          const isCurrentChannel = channels.get(channel.peerId) === channel;
          // Detect graceful disconnect
          const rtcProblem = problem as {
            errorDetail?: string;
            sctpCauseCode?: number;
          };
          if (
            rtcProblem?.errorDetail === 'sctp-failure' &&
            rtcProblem?.sctpCauseCode === SCTP_USER_INITIATED_ABORT
          ) {
            if (isCurrentChannel) {
              logger.log(
                `${channel.peerId}:: remote intentionally disconnected`,
              );
              // Mark as intentionally closed and don't trigger reconnection
              intentionallyClosed.add(channel.peerId);
            } else {
              logger.log(
                `${channel.peerId}:: stale channel intentionally disconnected`,
              );
            }
          } else if (isCurrentChannel) {
            outputError(
              channel.peerId,
              `reading message from ${channel.peerId}`,
              problem,
            );
            // Only trigger reconnection for non-intentional disconnects
            handleConnectionLoss(channel.peerId, channel);
          } else {
            logger.log(`${channel.peerId}:: ignoring error from stale channel`);
          }
          logger.log(`closed channel to ${channel.peerId}`);
          throw problem;
        }
        if (readBuf) {
          reconnectionManager.resetBackoff(channel.peerId); // successful inbound traffic
          await receiveMessage(channel.peerId, bufToString(readBuf.subarray()));
          lastConnectionTime.set(channel.peerId, Date.now()); // update timestamp on inbound activity
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
   * @param channel - Optional channel that experienced loss; used to ignore stale channels.
   */
  function handleConnectionLoss(peerId: string, channel?: Channel): void {
    const currentChannel = channels.get(peerId);
    // Ignore loss signals from stale channels if a different channel is active.
    if (channel && currentChannel && currentChannel !== channel) {
      logger.log(`${peerId}:: ignoring connection loss from stale channel`);
      return;
    }
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
    // Get queue reference - will re-fetch after long awaits to handle cleanup race conditions
    let queue = getMessageQueue(peerId);

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

      // Re-fetch queue after delay in case cleanupStalePeers deleted it during the await
      queue = getMessageQueue(peerId);

      // Re-check reconnection state after the await; it may have been stopped concurrently
      if (!reconnectionManager.isReconnecting(peerId) || signal.aborted) {
        return;
      }

      // If peer was intentionally closed while reconnecting, stop and exit
      if (intentionallyClosed.has(peerId)) {
        reconnectionManager.stopReconnection(peerId);
        return;
      }

      logger.log(
        `${peerId}:: reconnection attempt ${nextAttempt}${maxAttempts ? `/${maxAttempts}` : ''}`,
      );

      try {
        const hints = locationHints.get(peerId) ?? [];
        let channel: Channel | null = await connectionFactory.dialIdempotent(
          peerId,
          hints,
          false, // No retry here, we're already in a retry loop
        );

        // Re-fetch queue after dial in case cleanupStalePeers deleted it during the await
        queue = getMessageQueue(peerId);

        // Check if a concurrent call already registered a channel for this peer
        // (e.g., an inbound connection or another reconnection attempt)
        channel = await reuseOrReturnChannel(peerId, channel);
        // Handle case where existing channel died during await and dialed channel was closed
        if (channel === null) {
          logger.log(
            `${peerId}:: existing channel died during reuse check, continuing reconnection loop`,
          );
          // Channel died and dialed channel was already closed, continue loop to re-dial
          continue;
        }
        // Re-check after await to handle race condition where a channel was registered
        // concurrently during the microtask delay
        const registeredChannel = channels.get(peerId);
        if (registeredChannel) {
          // A channel was registered concurrently, use it instead
          if (channel !== registeredChannel) {
            // Close the dialed channel to prevent resource leak
            await connectionFactory.closeChannel(channel, peerId);
          }
          channel = registeredChannel;
          logger.log(
            `${peerId}:: reconnection: channel already exists, reusing existing channel`,
          );
        } else {
          // Re-check connection limit after reuseOrReturnChannel to prevent race conditions
          // Other connections (inbound or outbound) could be established during the await
          try {
            checkConnectionLimit();
          } catch (limitError) {
            // Connection limit reached - treat as retryable and continue loop
            // The limit might free up when other connections close
            logger.log(
              `${peerId}:: reconnection blocked by connection limit, will retry`,
            );
            outputError(
              peerId,
              `reconnection attempt ${nextAttempt}`,
              limitError,
            );
            // Explicitly close the channel to release network resources
            await connectionFactory.closeChannel(channel, peerId);
            // Continue the reconnection loop
            continue;
          }

          // Check if peer was intentionally closed during dial
          if (intentionallyClosed.has(peerId)) {
            logger.log(
              `${peerId}:: peer intentionally closed during dial, closing channel`,
            );
            await connectionFactory.closeChannel(channel, peerId);
            reconnectionManager.stopReconnection(peerId);
            return;
          }

          // Register the new channel and start reading
          registerChannel(peerId, channel);
        }

        logger.log(`${peerId}:: reconnection successful`);

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
          giveUpOnPeer(peerId, queue);
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
   * Validate message size before sending or queuing.
   *
   * @param message - The message to validate.
   * @throws ResourceLimitError if message exceeds size limit.
   */
  function validateMessageSize(message: string): void {
    const messageSizeBytes = new TextEncoder().encode(message).length;
    if (messageSizeBytes > maxMessageSizeBytes) {
      throw new ResourceLimitError(
        `Message size ${messageSizeBytes} bytes exceeds limit of ${maxMessageSizeBytes} bytes`,
        {
          data: {
            limitType: 'messageSize',
            current: messageSizeBytes,
            limit: maxMessageSizeBytes,
          },
        },
      );
    }
  }

  /**
   * Check if we can establish a new connection (within connection limit).
   *
   * @throws ResourceLimitError if connection limit is reached.
   */
  function checkConnectionLimit(): void {
    const currentConnections = channels.size;
    if (currentConnections >= maxConcurrentConnections) {
      throw new ResourceLimitError(
        `Connection limit reached: ${currentConnections}/${maxConcurrentConnections} concurrent connections`,
        {
          data: {
            limitType: 'connection',
            current: currentConnections,
            limit: maxConcurrentConnections,
          },
        },
      );
    }
  }

  /**
   * Register a channel and start reading from it.
   *
   * @param peerId - The peer ID for the channel.
   * @param channel - The channel to register.
   * @param errorContext - Optional context for error messages when reading fails.
   */
  function registerChannel(
    peerId: string,
    channel: Channel,
    errorContext = 'reading channel to',
  ): void {
    const previousChannel = channels.get(peerId);
    channels.set(peerId, channel);
    lastConnectionTime.set(peerId, Date.now());
    readChannel(channel).catch((problem) => {
      outputError(peerId, errorContext, problem);
    });

    // If we replaced an existing channel, close it to avoid leaks and stale readers.
    if (previousChannel && previousChannel !== channel) {
      const closePromise = connectionFactory.closeChannel(
        previousChannel,
        peerId,
      );
      if (typeof closePromise?.catch === 'function') {
        closePromise.catch((problem) => {
          outputError(peerId, 'closing replaced channel', problem);
        });
      }
    }
  }

  /**
   * Check if an existing channel exists for a peer, and if so, reuse it.
   * Otherwise, return the dialed channel for the caller to register.
   *
   * @param peerId - The peer ID for the channel.
   * @param dialedChannel - The newly dialed channel.
   * @returns The channel to use (either existing or the dialed one), or null if
   * the existing channel died during the await and the dialed channel was already closed.
   */
  async function reuseOrReturnChannel(
    peerId: string,
    dialedChannel: Channel,
  ): Promise<Channel | null> {
    const existingChannel = channels.get(peerId);
    if (existingChannel) {
      // Close the dialed channel if it's different from the existing one
      if (dialedChannel !== existingChannel) {
        await connectionFactory.closeChannel(dialedChannel, peerId);
        // Re-check if existing channel is still valid after await
        // It may have been removed if readChannel exited during the close,
        // or a new channel may have been registered concurrently
        const currentChannel = channels.get(peerId);
        if (currentChannel === existingChannel) {
          // Existing channel is still valid, use it
          return existingChannel;
        }
        if (currentChannel) {
          // A different channel was registered concurrently, use that instead
          return currentChannel;
        }
        // Existing channel died during await, but we already closed dialed channel
        // Return null to signal caller needs to handle this (re-dial or fail)
        return null;
      }
      // Same channel, check if it's still valid
      const currentChannel = channels.get(peerId);
      if (currentChannel === existingChannel) {
        // Still the same channel, use it
        return existingChannel;
      }
      if (currentChannel) {
        // A different channel was registered concurrently, use that instead
        return currentChannel;
      }
      // Channel died, but we can't close dialed channel since it's the same
      // Return null to signal caller needs to handle this
      return null;
    }
    // No existing channel, return the dialed one for caller to register
    return dialedChannel;
  }

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
   * Clean up stale peer data for peers disconnected for more than 1 hour.
   */
  function cleanupStalePeers(): void {
    const now = Date.now();
    const stalePeers: string[] = [];

    // Check all tracked peers
    for (const [peerId, lastTime] of lastConnectionTime.entries()) {
      const timeSinceLastConnection = now - lastTime;
      const hasActiveChannel = channels.has(peerId);
      const isReconnecting = reconnectionManager.isReconnecting(peerId);

      // Consider peer stale if:
      // - No active channel
      // - Not currently reconnecting
      // - Disconnected for more than stalePeerTimeoutMs
      if (
        !hasActiveChannel &&
        !isReconnecting &&
        timeSinceLastConnection > stalePeerTimeoutMs
      ) {
        stalePeers.push(peerId);
      }
    }

    // Clean up stale peer data
    for (const peerId of stalePeers) {
      const lastTime = lastConnectionTime.get(peerId);
      if (lastTime !== undefined) {
        const minutesSinceDisconnect = Math.round((now - lastTime) / 1000 / 60);
        logger.log(
          `${peerId}:: cleaning up stale peer data (disconnected for ${minutesSinceDisconnect} minutes)`,
        );
      }

      // Remove from all tracking structures
      lastConnectionTime.delete(peerId);
      messageQueues.delete(peerId);
      locationHints.delete(peerId);
      intentionallyClosed.delete(peerId);
      // Clear reconnection state
      reconnectionManager.clearPeer(peerId);
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

    // Validate message size before processing
    validateMessageSize(message);

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

    let channel: Channel | null | undefined = channels.get(targetPeerId);
    if (!channel) {
      // Check connection limit before dialing new connection
      // (Early check to fail fast, but we'll check again after dial to prevent race conditions)
      checkConnectionLimit();

      try {
        const hints = locationHints.get(targetPeerId) ?? [];
        channel = await connectionFactory.dialIdempotent(
          targetPeerId,
          hints,
          true, // With retry for initial connection
        );

        // Re-fetch queue after dial in case cleanupStalePeers deleted it during the await
        // This prevents orphaned messages in a stale queue reference
        const currentQueue = getMessageQueue(targetPeerId);

        // Check if reconnection started while we were dialing (race condition protection)
        if (reconnectionManager.isReconnecting(targetPeerId)) {
          currentQueue.enqueue(message);
          logger.log(
            `${targetPeerId}:: reconnection started during dial, queueing message ` +
              `(${currentQueue.length}/${maxQueue}): ${message}`,
          );
          // Explicitly close the channel to release network resources
          // The reconnection loop will dial its own new channel
          await connectionFactory.closeChannel(channel, targetPeerId);
          return;
        }

        // Check if a concurrent call already registered a channel for this peer
        channel = await reuseOrReturnChannel(targetPeerId, channel);
        // Handle case where existing channel died during await and dialed channel was closed
        if (channel === null) {
          // Existing channel died and dialed channel was already closed
          // Trigger reconnection to re-dial
          logger.log(
            `${targetPeerId}:: existing channel died during reuse check, triggering reconnection`,
          );
          currentQueue.enqueue(message);
          handleConnectionLoss(targetPeerId);
          return;
        }
        // Re-check after await to handle race condition where a channel was registered
        // concurrently during the microtask delay
        const registeredChannel = channels.get(targetPeerId);
        if (registeredChannel) {
          // A channel was registered concurrently, use it instead
          if (channel !== registeredChannel) {
            // Close the dialed channel to prevent resource leak
            await connectionFactory.closeChannel(channel, targetPeerId);
          }
          channel = registeredChannel;
          // Existing channel reused, nothing more to do
        } else {
          // Re-check connection limit after dial completes to prevent race conditions
          // Multiple concurrent dials could all pass the initial check, then all add channels
          try {
            checkConnectionLimit();
          } catch {
            // Connection limit reached - close the dialed channel and queue the message
            logger.log(
              `${targetPeerId}:: connection limit reached after dial, queueing message`,
            );
            // Explicitly close the channel to release network resources
            await connectionFactory.closeChannel(channel, targetPeerId);
            currentQueue.enqueue(message);
            // Start reconnection to retry later when limit might free up
            handleConnectionLoss(targetPeerId);
            return;
          }

          // Check if peer was intentionally closed during dial
          if (intentionallyClosed.has(targetPeerId)) {
            logger.log(
              `${targetPeerId}:: peer intentionally closed during dial, closing channel`,
            );
            await connectionFactory.closeChannel(channel, targetPeerId);
            throw new Error('Message delivery failed after intentional close');
          }

          // Register the new channel and start reading
          registerChannel(targetPeerId, channel);
        }
      } catch (problem) {
        outputError(targetPeerId, `opening connection`, problem);
        handleConnectionLoss(targetPeerId);
        // Re-fetch queue in case cleanupStalePeers deleted it during the dial await
        const currentQueue = getMessageQueue(targetPeerId);
        currentQueue.enqueue(message);
        return;
      }
    }

    try {
      logger.log(`${targetPeerId}:: send ${message}`);
      await writeWithTimeout(channel, fromString(message), 10_000);
      reconnectionManager.resetBackoff(targetPeerId);
      lastConnectionTime.set(targetPeerId, Date.now());
    } catch (problem) {
      outputError(targetPeerId, `sending message`, problem);
      handleConnectionLoss(targetPeerId, channel);
      // Re-fetch queue in case cleanupStalePeers deleted it during the await
      const currentQueue = getMessageQueue(targetPeerId);
      currentQueue.enqueue(message);
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
      // Explicitly close the channel to release network resources
      const closePromise = connectionFactory.closeChannel(
        channel,
        channel.peerId,
      );
      if (typeof closePromise?.catch === 'function') {
        closePromise.catch((problem) => {
          outputError(
            channel.peerId,
            'closing rejected inbound channel from intentionally closed peer',
            problem,
          );
        });
      }
      return;
    }

    // Check connection limit for inbound connections only if no existing channel
    // If a channel already exists, this is likely a reconnection and the peer already has a slot
    if (!channels.has(channel.peerId)) {
      try {
        checkConnectionLimit();
      } catch {
        logger.log(
          `${channel.peerId}:: rejecting inbound connection due to connection limit`,
        );
        // Explicitly close the channel to release network resources
        const closePromise = connectionFactory.closeChannel(
          channel,
          channel.peerId,
        );
        if (typeof closePromise?.catch === 'function') {
          closePromise.catch((problem) => {
            outputError(
              channel.peerId,
              'closing rejected inbound channel',
              problem,
            );
          });
        }
        return;
      }
    }

    registerChannel(channel.peerId, channel, 'error in inbound channel read');
  });

  // Install wake detector to reset backoff on sleep/wake
  cleanupWakeDetector = installWakeDetector(handleWakeFromSleep);

  // Start periodic cleanup task for stale peers
  cleanupIntervalId = setInterval(() => {
    if (!signal.aborted) {
      cleanupStalePeers();
    }
  }, cleanupIntervalMs);

  /**
   * Explicitly close a connection to a peer.
   * Marks the peer as intentionally closed to prevent automatic reconnection.
   *
   * @param peerId - The peer ID to close the connection for.
   */
  async function closeConnection(peerId: string): Promise<void> {
    logger.log(`${peerId}:: explicitly closing connection`);
    intentionallyClosed.add(peerId);
    // Get the channel before removing from map
    const channel = channels.get(peerId);
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
    // Actually close the underlying network connection
    if (channel) {
      try {
        await connectionFactory.closeChannel(channel, peerId);
      } catch (problem) {
        outputError(peerId, 'closing connection', problem);
      }
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
      locationHints.set(peerId, Array.from(hints));
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
    // Stop cleanup interval
    if (cleanupIntervalId) {
      clearInterval(cleanupIntervalId);
      cleanupIntervalId = undefined;
    }
    stopController.abort(); // cancels all delays and dials
    await connectionFactory.stop();
    channels.clear();
    reconnectionManager.clear();
    messageQueues.clear();
    intentionallyClosed.clear();
    lastConnectionTime.clear();
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
