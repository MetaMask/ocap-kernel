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
import { ReconnectionManager } from './ReconnectionManager.ts';
import type {
  RemoteMessageHandler,
  SendRemoteMessage,
  StopRemoteComms,
  Channel,
  OnRemoteGiveUp,
  RemoteCommsOptions,
} from './types.ts';

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
 * @param options.maxQueue - Maximum pending messages per peer (default: 200).
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
    maxConcurrentConnections = DEFAULT_MAX_CONCURRENT_CONNECTIONS,
    maxMessageSizeBytes = DEFAULT_MAX_MESSAGE_SIZE_BYTES,
    cleanupIntervalMs = DEFAULT_CLEANUP_INTERVAL_MS,
    stalePeerTimeoutMs = DEFAULT_STALE_PEER_TIMEOUT_MS,
  } = options;
  let cleanupWakeDetector: (() => void) | undefined;
  const stopController = new AbortController();
  const { signal } = stopController;
  const logger = new Logger();
  const reconnectionManager = new ReconnectionManager();
  const intentionallyClosed = new Set<string>(); // Peers that intentionally closed connections
  const lastConnectionTime = new Map<string, number>(); // Track last connection time for cleanup
  const messageEncoder = new TextEncoder(); // Reused for message size validation
  let cleanupIntervalId: ReturnType<typeof setInterval> | undefined;
  const connectionFactory = await ConnectionFactory.make(
    keySeed,
    relays,
    logger,
    signal,
    maxRetryAttempts,
  );

  // Per-peer connection state (simplified - just channel and hints)
  type SimplePeerState = {
    channel: Channel | undefined;
    locationHints: string[];
  };
  const peerStates = new Map<string, SimplePeerState>();

  /**
   * Get or create peer connection state.
   *
   * @param peerId - The peer ID.
   * @returns The peer connection state.
   */
  function getPeerState(peerId: string): SimplePeerState {
    let state = peerStates.get(peerId);
    if (!state) {
      state = { channel: undefined, locationHints: [] };
      peerStates.set(peerId, state);
      // Initialize lastConnectionTime to enable stale peer cleanup
      // even for peers that never successfully connect
      if (!lastConnectionTime.has(peerId)) {
        lastConnectionTime.set(peerId, Date.now());
      }
    }
    return state;
  }

  /**
   * Count the number of active connections (peers with channels).
   *
   * @returns The number of active connections.
   */
  function countActiveConnections(): number {
    let count = 0;
    for (const state of peerStates.values()) {
      if (state.channel) {
        count += 1;
      }
    }
    return count;
  }

  /**
   * Validate that a message does not exceed the size limit.
   *
   * @param message - The message to validate.
   * @throws ResourceLimitError if message exceeds size limit.
   */
  function validateMessageSize(message: string): void {
    const messageSizeBytes = messageEncoder.encode(message).length;
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
    const currentConnections = countActiveConnections();
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
   * Clean up stale peer data for peers inactive for more than stalePeerTimeoutMs.
   * A peer is considered stale if:
   * - It has no active channel
   * - It has been inactive for more than stalePeerTimeoutMs
   */
  function cleanupStalePeers(): void {
    const now = Date.now();
    const peersToCleanup: string[] = [];

    for (const [peerId, lastTime] of lastConnectionTime.entries()) {
      const state = peerStates.get(peerId);
      const timeSinceLastActivity = now - lastTime;

      // Only clean up peers that:
      // - Have no active channel
      // - Inactive for more than stalePeerTimeoutMs
      if (!state?.channel && timeSinceLastActivity > stalePeerTimeoutMs) {
        peersToCleanup.push(peerId);
      }
    }

    for (const peerId of peersToCleanup) {
      const lastTime = lastConnectionTime.get(peerId);
      logger.log(
        `Cleaning up stale peer ${peerId} (inactive for ${lastTime ? Date.now() - lastTime : 'unknown'}ms)`,
      );
      // Clean up all peer-related state
      peerStates.delete(peerId);
      reconnectionManager.stopReconnection(peerId);
      intentionallyClosed.delete(peerId);
      lastConnectionTime.delete(peerId);
    }
  }

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
        reject(Error(`Message send timed out after ${timeoutMs}ms`));
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
    const state = getPeerState(peerId);
    const previousChannel = state.channel;
    state.channel = channel;
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
    const state = getPeerState(peerId);
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
          lastConnectionTime.set(channel.peerId, Date.now());
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
      const state = getPeerState(channel.peerId);
      if (state.channel === channel) {
        state.channel = undefined;
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
    const state = getPeerState(peerId);
    state.channel = undefined;

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
    const state = getPeerState(peerId);

    while (reconnectionManager.isReconnecting(peerId) && !signal.aborted) {
      if (!reconnectionManager.shouldRetry(peerId, maxAttempts)) {
        logger.log(
          `${peerId}:: max reconnection attempts (${maxAttempts}) reached, giving up`,
        );
        reconnectionManager.stopReconnection(peerId);
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
        const { locationHints: hints } = state;
        const dialedChannel = await connectionFactory.dialIdempotent(
          peerId,
          hints,
          false, // No retry here, we're already in a retry loop
        );

        // Handle race condition - check if an existing channel appeared
        const channel = await reuseOrReturnChannel(peerId, dialedChannel);
        if (!channel) {
          // Channel was closed and existing also died - continue retry loop
          continue;
        }

        // Re-check connection limit after reuseOrReturnChannel to prevent race conditions
        if (state.channel !== channel) {
          checkConnectionLimit();
        }

        // Only register if this is a new channel (not reusing existing)
        if (state.channel !== channel) {
          registerChannel(peerId, channel, 'reading channel to');
        }

        logger.log(`${peerId}:: reconnection successful`);

        // Connection established - RemoteHandle will retransmit unACKed messages
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
    if (intentionallyClosed.has(targetPeerId)) {
      throw Error('Message delivery failed after intentional close');
    }

    // Validate message size before sending
    validateMessageSize(message);

    const state = getPeerState(targetPeerId);

    // Get or establish channel
    let { channel } = state;
    if (!channel) {
      // Check connection limit before attempting to dial
      checkConnectionLimit();

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
      await writeWithTimeout(channel, fromString(message), 10_000);
      lastConnectionTime.set(targetPeerId, Date.now());
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
    if (intentionallyClosed.has(channel.peerId)) {
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
    intentionallyClosed.add(peerId);
    const state = getPeerState(peerId);
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
    const state = getPeerState(peerId);
    const { locationHints: oldHints } = state;
    if (oldHints.length > 0) {
      const newHints = new Set(oldHints);
      for (const hint of hints) {
        newHints.add(hint);
      }
      state.locationHints = Array.from(newHints);
    } else {
      state.locationHints = Array.from(hints);
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
    // Close all active channel streams to unblock pending reads
    for (const state of peerStates.values()) {
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
    peerStates.clear();
    reconnectionManager.clear();
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
