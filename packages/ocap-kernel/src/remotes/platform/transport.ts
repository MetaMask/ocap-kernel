import { AbortError, ResourceLimitError } from '@metamask/kernel-errors';
import { installWakeDetector } from '@metamask/kernel-utils';
import { Logger } from '@metamask/logger';
import { toString as bufToString, fromString } from 'uint8arrays';

import { makeErrorLogger, writeWithTimeout } from './channel-utils.ts';
import { ConnectionFactory } from './connection-factory.ts';
import {
  DEFAULT_CLEANUP_INTERVAL_MS,
  DEFAULT_MAX_CONCURRENT_CONNECTIONS,
  DEFAULT_MAX_MESSAGE_SIZE_BYTES,
  DEFAULT_STALE_PEER_TIMEOUT_MS,
  DEFAULT_WRITE_TIMEOUT_MS,
  SCTP_USER_INITIATED_ABORT,
} from './constants.ts';
import { PeerStateManager } from './peer-state-manager.ts';
import {
  DEFAULT_CONNECTION_RATE_LIMIT,
  DEFAULT_MESSAGE_RATE_LIMIT,
  DEFAULT_MESSAGE_RATE_WINDOW_MS,
  makeConnectionRateLimiter,
  makeMessageRateLimiter,
} from './rate-limiter.ts';
import { makeReconnectionLifecycle } from './reconnection-lifecycle.ts';
import { ReconnectionManager } from './reconnection.ts';
import {
  makeConnectionLimitChecker,
  makeMessageSizeValidator,
} from './validators.ts';
import type {
  RemoteMessageHandler,
  SendRemoteMessage,
  StopRemoteComms,
  Channel,
  OnRemoteGiveUp,
  RemoteCommsOptions,
} from '../types.ts';

/**
 * Initialize the remote comm system with information that must be provided by the kernel.
 *
 * @param keySeed - Seed value for key generation, in the form of a hex-encoded string.
 * @param options - Options for remote communications initialization.
 * @param options.relays - PeerIds/Multiaddrs of known message relays.
 * @param options.maxRetryAttempts - Maximum number of reconnection attempts. 0 = infinite (default).
 * @param options.maxQueue - Maximum pending messages per peer (default: 200).
 * @param options.maxConcurrentConnections - Maximum number of concurrent connections (default: 100).
 * @param options.maxMessageSizeBytes - Maximum message size in bytes (default: 1MB).
 * @param options.cleanupIntervalMs - Stale peer cleanup interval in milliseconds (default: 15 minutes).
 * @param options.stalePeerTimeoutMs - Stale peer timeout in milliseconds (default: 1 hour).
 * @param options.maxMessagesPerSecond - Maximum messages per second per peer (default: 100).
 * @param options.maxConnectionAttemptsPerMinute - Maximum connection attempts per minute per peer (default: 10).
 * @param remoteMessageHandler - Handler to be called when messages are received from elsewhere.
 * @param onRemoteGiveUp - Optional callback to be called when we give up on a remote (after max retries or non-retryable error).
 *
 * @returns a function to send messages **and** a `stop()` to cancel/release everything.
 */
export async function initTransport(
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
    maxConcurrentConnections = DEFAULT_MAX_CONCURRENT_CONNECTIONS,
    maxMessageSizeBytes = DEFAULT_MAX_MESSAGE_SIZE_BYTES,
    cleanupIntervalMs = DEFAULT_CLEANUP_INTERVAL_MS,
    stalePeerTimeoutMs = DEFAULT_STALE_PEER_TIMEOUT_MS,
    maxMessagesPerSecond = DEFAULT_MESSAGE_RATE_LIMIT,
    maxConnectionAttemptsPerMinute = DEFAULT_CONNECTION_RATE_LIMIT,
  } = options;
  let cleanupWakeDetector: (() => void) | undefined;
  const stopController = new AbortController();
  const { signal } = stopController;
  const logger = new Logger();
  const outputError = makeErrorLogger(logger);
  const reconnectionManager = new ReconnectionManager();
  const peerStateManager = new PeerStateManager(logger, stalePeerTimeoutMs);
  const validateMessageSize = makeMessageSizeValidator(maxMessageSizeBytes);
  const checkConnectionLimit = makeConnectionLimitChecker(
    maxConcurrentConnections,
    () => peerStateManager.countActiveConnections(),
  );
  const messageRateLimiter = makeMessageRateLimiter(maxMessagesPerSecond);
  const connectionRateLimiter = makeConnectionRateLimiter(
    maxConnectionAttemptsPerMinute,
  );
  let cleanupIntervalId: ReturnType<typeof setInterval> | undefined;
  // Holder for handleConnectionLoss - initialized later after all dependencies are defined
  // This breaks the circular dependency between readChannel → handleConnectionLoss → registerChannel
  const reconnectionHolder: {
    handleConnectionLoss: ((peerId: string) => void) | undefined;
  } = { handleConnectionLoss: undefined };
  const handleConnectionLoss = (peerId: string): void => {
    if (!reconnectionHolder.handleConnectionLoss) {
      throw new Error('handleConnectionLoss not initialized');
    }
    reconnectionHolder.handleConnectionLoss(peerId);
  };
  const connectionFactory = await ConnectionFactory.make(
    keySeed,
    relays,
    logger,
    signal,
    maxRetryAttempts,
  );

  /**
   * Clean up stale peer data for peers inactive for more than stalePeerTimeoutMs.
   * A peer is considered stale if:
   * - It has no active channel
   * - It has been inactive for more than stalePeerTimeoutMs
   */
  function cleanupStalePeers(): void {
    const stalePeers = peerStateManager.getStalePeers();
    for (const peerId of stalePeers) {
      peerStateManager.removePeer(peerId);
      reconnectionManager.stopReconnection(peerId);
      messageRateLimiter.clearKey(peerId);
      connectionRateLimiter.clearKey(peerId);
    }
    // Also prune stale rate limiter entries that may not have peer state
    messageRateLimiter.pruneStale();
    connectionRateLimiter.pruneStale();
  }

  /**
   * Register a channel for a peer, closing any previous channel.
   * This ensures proper cleanup of old channels to prevent leaks.
   *
   * @param peerId - The peer ID.
   * @param channel - The channel to register.
   * @param errorContext - Context string for error logging.
   */
  function registerChannel(
    peerId: string,
    channel: Channel,
    errorContext = 'reading channel to',
  ): void {
    const state = peerStateManager.getState(peerId);
    const previousChannel = state.channel;
    state.channel = channel;
    peerStateManager.updateConnectionTime(peerId);
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
   * This handles race conditions when simultaneous inbound + outbound connections occur.
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
    const state = peerStateManager.getState(peerId);
    const existingChannel = state.channel;
    if (existingChannel) {
      // Close the dialed channel if it's different from the existing one
      if (dialedChannel !== existingChannel) {
        await connectionFactory.closeChannel(dialedChannel, peerId);
        // Re-check if existing channel is still valid after await
        // It may have been removed if readChannel exited during the close,
        // or a new channel may have been registered concurrently
        const currentChannel = state.channel;
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
      if (state.channel === existingChannel) {
        // Still the same channel, use it
        return existingChannel;
      }
      // Channel changed during our check, use the current one
      if (state.channel) {
        return state.channel;
      }
      // Channel became null, return null to signal re-dial needed
      return null;
    }
    // No existing channel, return the dialed one for registration
    return dialedChannel;
  }

  /**
   * Receive a message from a peer.
   *
   * @param from - The peer ID that the message is from.
   * @param message - The message to receive.
   */
  async function receiveMessage(from: string, message: string): Promise<void> {
    logger.log(`${from}:: recv ${message.substring(0, 200)}`);

    // Pass all messages to handler (including ACK-only messages - handler handles them)
    try {
      const reply = await remoteMessageHandler(from, message);
      // Send reply if non-empty (reply is already a serialized string from RemoteHandle)
      if (reply) {
        // IMPORTANT: Don't await here! Awaiting would block the read loop.
        // Fire-and-forget - RemoteHandle handles ACK tracking.
        sendRemoteMessage(from, reply).catch((replyError) => {
          outputError(from, 'sending reply', replyError);
        });
      }
    } catch (handlerError) {
      outputError(from, 'processing received message', handlerError);
    }
  }

  /**
   * Start reading (and processing) messages arriving on a channel.
   *
   * @param channel - The channel to read from.
   */
  async function readChannel(channel: Channel): Promise<void> {
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
            peerStateManager.markIntentionallyClosed(channel.peerId);
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
          peerStateManager.updateConnectionTime(channel.peerId);
          await receiveMessage(channel.peerId, bufToString(readBuf.subarray()));
        } else {
          // Stream ended (returned undefined), exit the read loop
          logger.log(`${channel.peerId}:: stream ended`);
          break;
        }
      }
    } finally {
      // Always remove the channel when readChannel exits to prevent stale channels
      // This ensures that subsequent sends will establish a new connection
      const state = peerStateManager.getState(channel.peerId);
      if (state.channel === channel) {
        state.channel = undefined;
      }
    }
  }

  // Initialize reconnection lifecycle and bind to the holder
  const reconnectionLifecycle = makeReconnectionLifecycle({
    logger,
    outputError,
    signal,
    peerStateManager,
    reconnectionManager,
    maxRetryAttempts,
    onRemoteGiveUp,
    dialPeer: async (peerId, hints) =>
      connectionFactory.dialIdempotent(peerId, hints, false),
    reuseOrReturnChannel,
    checkConnectionLimit,
    checkConnectionRateLimit: (peerId: string) =>
      connectionRateLimiter.checkAndRecord(peerId, 'connectionRate'),
    registerChannel,
  });
  reconnectionHolder.handleConnectionLoss =
    reconnectionLifecycle.handleConnectionLoss;

  /**
   * Send a message string to a peer.
   * The message is already serialized (with seq/ack) by RemoteHandle.
   *
   * @param targetPeerId - The peer ID to send the message to.
   * @param message - The serialized message string.
   * @returns Promise that resolves when the send completes.
   */
  async function sendRemoteMessage(
    targetPeerId: string,
    message: string,
  ): Promise<void> {
    if (signal.aborted) {
      throw Error('Network stopped');
    }

    // Check if peer is intentionally closed
    if (peerStateManager.isIntentionallyClosed(targetPeerId)) {
      throw Error('Message delivery failed after intentional close');
    }

    // Validate message size before sending
    validateMessageSize(message);

    // Check message rate limit (check only, record after successful send)
    if (messageRateLimiter.wouldExceedLimit(targetPeerId)) {
      const currentCount = messageRateLimiter.getCurrentCount(targetPeerId);
      throw new ResourceLimitError(
        `Rate limit exceeded: ${currentCount}/${maxMessagesPerSecond} messageRate in ${DEFAULT_MESSAGE_RATE_WINDOW_MS}ms window`,
        {
          data: {
            limitType: 'messageRate',
            current: currentCount,
            limit: maxMessagesPerSecond,
          },
        },
      );
    }

    const state = peerStateManager.getState(targetPeerId);

    // Get or establish channel
    let { channel } = state;
    if (!channel) {
      // Check connection limit before attempting to dial
      checkConnectionLimit();

      // Check connection attempt rate limit
      connectionRateLimiter.checkAndRecord(targetPeerId, 'connectionRate');

      try {
        const { locationHints: hints } = state;
        channel = await connectionFactory.dialIdempotent(
          targetPeerId,
          hints,
          true,
        );

        // Handle race condition - check if an existing channel appeared
        const resolvedChannel = await reuseOrReturnChannel(
          targetPeerId,
          channel,
        );
        if (!resolvedChannel) {
          // Channel was closed and existing also died - throw to trigger retry
          throw Error('Connection race condition - retry needed');
        }
        channel = resolvedChannel;

        // Re-check connection limit after reuseOrReturnChannel to prevent race conditions
        if (state.channel !== channel) {
          checkConnectionLimit();
          registerChannel(targetPeerId, channel, 'reading channel to');
        }
      } catch (problem) {
        // Re-throw ResourceLimitError to propagate to caller
        if (problem instanceof ResourceLimitError) {
          throw problem;
        }
        outputError(targetPeerId, `opening connection`, problem);
        handleConnectionLoss(targetPeerId);
        throw problem;
      }
    }

    try {
      await writeWithTimeout(
        channel,
        fromString(message),
        DEFAULT_WRITE_TIMEOUT_MS,
      );
      // Record message rate only after successful send
      messageRateLimiter.recordEvent(targetPeerId);
      peerStateManager.updateConnectionTime(targetPeerId);
      reconnectionManager.resetBackoff(targetPeerId);
    } catch (problem) {
      outputError(targetPeerId, `sending message`, problem);
      handleConnectionLoss(targetPeerId);
      throw problem;
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
    if (peerStateManager.isIntentionallyClosed(channel.peerId)) {
      logger.log(
        `${channel.peerId}:: rejecting inbound connection from intentionally closed peer`,
      );
      // Don't add to channels map and don't start reading - connection will naturally close
      return;
    }

    // Check connection limit before accepting
    try {
      checkConnectionLimit();
    } catch (error) {
      if (error instanceof ResourceLimitError) {
        logger.log(
          `${channel.peerId}:: rejecting inbound connection due to connection limit`,
        );
        return;
      }
      throw error;
    }

    registerChannel(channel.peerId, channel, 'error in inbound channel read');
  });

  // Install wake detector to reset backoff on sleep/wake
  cleanupWakeDetector = installWakeDetector(handleWakeFromSleep);

  // Start periodic cleanup of stale peer data
  cleanupIntervalId = setInterval(() => {
    cleanupStalePeers();
  }, cleanupIntervalMs);

  /**
   * Explicitly close a connection to a peer.
   * Marks the peer as intentionally closed to prevent automatic reconnection.
   *
   * @param peerId - The peer ID to close the connection for.
   */
  async function closeConnection(peerId: string): Promise<void> {
    logger.log(`${peerId}:: explicitly closing connection`);
    peerStateManager.markIntentionallyClosed(peerId);
    const state = peerStateManager.getState(peerId);
    // Remove channel - the readChannel cleanup will handle stream closure
    state.channel = undefined;
    if (reconnectionManager.isReconnecting(peerId)) {
      reconnectionManager.stopReconnection(peerId);
    }
  }

  /**
   * Take note of where a peer might be.
   *
   * @param peerId - The peer ID to which this information applies.
   * @param hints - Location hints for the peer.
   */
  function registerLocationHints(peerId: string, hints: string[]): void {
    peerStateManager.addLocationHints(peerId, hints);
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
    peerStateManager.clearIntentionallyClosed(peerId);
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
    // Close all active channel streams to unblock pending reads
    for (const state of peerStateManager.getAllStates()) {
      const { channel } = state;
      if (channel) {
        try {
          // Close the stream to unblock any pending read operations
          const stream = channel.msgStream.unwrap() as { close?: () => void };
          stream.close?.();
        } catch {
          // Ignore errors during cleanup
        }
        state.channel = undefined;
      }
    }
    await connectionFactory.stop();
    peerStateManager.clear();
    reconnectionManager.clear();
    messageRateLimiter.clear();
    connectionRateLimiter.clear();
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
