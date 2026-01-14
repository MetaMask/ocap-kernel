import { makePromiseKit } from '@endo/promise-kit';
import {
  AbortError,
  isRetryableNetworkError,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
import { PeerConnectionState } from './PeerConnectionState.ts';
import type { PendingMessage } from './PeerConnectionState.ts';
import { ReconnectionManager } from './ReconnectionManager.ts';
import type { RemoteMessageBase } from './RemoteHandle.ts';
import type {
  RemoteMessageHandler,
  SendRemoteMessage,
  StopRemoteComms,
  Channel,
  OnRemoteGiveUp,
  RemoteCommsOptions,
} from './types.ts';

/** Default maximum pending messages per peer */
const DEFAULT_MAX_QUEUE = 200;

/** Default maximum number of concurrent connections */
const DEFAULT_MAX_CONCURRENT_CONNECTIONS = 100;

/** Default maximum message size in bytes (1MB) */
const DEFAULT_MAX_MESSAGE_SIZE_BYTES = 1024 * 1024;

/** Default stale peer cleanup interval in milliseconds (15 minutes) */
const DEFAULT_CLEANUP_INTERVAL_MS = 15 * 60 * 1000;

/** Default stale peer timeout in milliseconds (1 hour) */
const DEFAULT_STALE_PEER_TIMEOUT_MS = 60 * 60 * 1000;

/** Timeout for waiting for message ACK before retry */
const ACK_TIMEOUT_MS = 10_000; // 10 seconds

/** Maximum number of retries for unacknowledged messages */
const MAX_RETRIES = 3;

/** Delay before sending standalone ACK when no outgoing message to piggyback on */
const DELAYED_ACK_MS = 50; // 50ms - similar to TCP delayed ACK

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
  handleAck: (peerId: string, ackSeq: number) => Promise<void>;
  updateReceivedSeq: (peerId: string, seq: number) => void;
}> {
  /* eslint-disable @typescript-eslint/no-unused-vars */
  // TODO: Implement resource limits (these are unused for now)
  const {
    relays = [],
    maxRetryAttempts,
    maxQueue = DEFAULT_MAX_QUEUE,
    maxConcurrentConnections = DEFAULT_MAX_CONCURRENT_CONNECTIONS,
    maxMessageSizeBytes = DEFAULT_MAX_MESSAGE_SIZE_BYTES,
    cleanupIntervalMs = DEFAULT_CLEANUP_INTERVAL_MS,
    stalePeerTimeoutMs = DEFAULT_STALE_PEER_TIMEOUT_MS,
  } = options;
  /* eslint-enable @typescript-eslint/no-unused-vars */
  let cleanupWakeDetector: (() => void) | undefined;
  const stopController = new AbortController();
  const { signal } = stopController;
  const logger = new Logger();
  const reconnectionManager = new ReconnectionManager();
  const intentionallyClosed = new Set<string>(); // Peers that intentionally closed connections
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const lastConnectionTime = new Map<string, number>(); // Track last connection time for cleanup
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const messageEncoder = new TextEncoder(); // Reused for message size validation
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let cleanupIntervalId: ReturnType<typeof setInterval> | undefined;
  const connectionFactory = await ConnectionFactory.make(
    keySeed,
    relays,
    logger,
    signal,
    maxRetryAttempts,
  );

  // Per-peer connection state
  const peerStates = new Map<string, PeerConnectionState>();

  // Per-peer ACK timeout handle (single timeout for queue)
  const ackTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

  // Per-peer delayed ACK timeout (for sending standalone ACKs)
  const delayedAckTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

  /**
   * Get or create peer connection state.
   *
   * @param peerId - The peer ID.
   * @returns The peer connection state.
   */
  function getPeerState(peerId: string): PeerConnectionState {
    let state = peerStates.get(peerId);
    if (!state) {
      state = new PeerConnectionState(peerId, maxQueue);
      peerStates.set(peerId, state);
    }
    return state;
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
   * Helper to clear ACK timeout for a peer.
   * Properly cancels the timeout and removes it from tracking.
   *
   * @param peerId - The peer ID.
   */
  function clearAckTimeout(peerId: string): void {
    const timeout = ackTimeouts.get(peerId);
    if (timeout) {
      clearTimeout(timeout);
      ackTimeouts.delete(peerId);
    }
  }

  /**
   * Start or restart ACK timeout for pending messages.
   * Clears any existing timeout first.
   *
   * @param peerId - The peer ID.
   */
  function startAckTimeout(peerId: string): void {
    // Clear any existing timeout first
    clearAckTimeout(peerId);

    const state = getPeerState(peerId);
    const head = state.peekFirstPending();
    if (!head) {
      // No pending messages - nothing to timeout
      return;
    }

    // Start timeout for pending messages
    const timeoutHandle = setTimeout(() => {
      handleAckTimeout(peerId);
    }, ACK_TIMEOUT_MS);

    ackTimeouts.set(peerId, timeoutHandle);
  }

  /**
   * Clear delayed ACK timeout for a peer.
   *
   * @param peerId - The peer ID.
   */
  function clearDelayedAck(peerId: string): void {
    const timeout = delayedAckTimeouts.get(peerId);
    if (timeout) {
      clearTimeout(timeout);
      delayedAckTimeouts.delete(peerId);
    }
  }

  /**
   * Start delayed ACK timer for a peer.
   * If no outgoing message is sent before the timer fires, sends a standalone ACK.
   * This implements Nagle-like delayed ACK to ensure ACKs are sent even without
   * outgoing traffic to piggyback on.
   *
   * @param peerId - The peer ID.
   */
  function startDelayedAck(peerId: string): void {
    // Clear any existing delayed ACK timer
    clearDelayedAck(peerId);

    const state = getPeerState(peerId);
    const ackSeq = state.getHighestReceivedSeq();
    if (ackSeq === undefined) {
      // Nothing to ACK
      return;
    }

    const timeoutHandle = setTimeout(() => {
      delayedAckTimeouts.delete(peerId);
      sendStandaloneAck(peerId).catch((error) => {
        outputError(peerId, 'sending standalone ACK', error);
      });
    }, DELAYED_ACK_MS);

    delayedAckTimeouts.set(peerId, timeoutHandle);
  }

  /**
   * Send a standalone ACK message (no payload, just ACK).
   * Used when we need to acknowledge received messages but have no outgoing
   * message to piggyback the ACK on.
   *
   * @param peerId - The peer ID to send the ACK to.
   */
  async function sendStandaloneAck(peerId: string): Promise<void> {
    const state = getPeerState(peerId);
    const ackSeq = state.getHighestReceivedSeq();
    if (ackSeq === undefined) {
      // Nothing to ACK
      return;
    }

    const channel = state.getChannel();
    if (!channel) {
      // No channel - can't send ACK
      // The ACK will be piggybacked on the next outgoing message
      return;
    }

    // Send ACK-only message (no seq, no method, just ack)
    const ackMessage = JSON.stringify({ ack: ackSeq });
    logger.log(`${peerId}:: sending standalone ACK ${ackSeq}`);

    try {
      await writeWithTimeout(channel, fromString(ackMessage), 10_000);
    } catch (error) {
      // ACK send failed - not critical, peer will retransmit
      outputError(peerId, `sending standalone ACK ${ackSeq}`, error);
    }
  }

  /**
   * Handle ACK timeout for pending messages - retry all pending or reject all.
   *
   * TODO: Potential retransmission storm issue. In-order transmission means
   * if message N times out, all messages N+1, N+2, ... are also unACKed and
   * get retransmitted together. Standard mitigations from networking literature
   * include: exponential backoff (partially addressed by reconnection backoff),
   * rate limiting (#661), and spreading retransmissions over time. Consider
   * implementing selective retransmission pacing if storms become an issue.
   *
   * @param peerId - The peer ID.
   */
  function handleAckTimeout(peerId: string): void {
    const state = getPeerState(peerId);
    const head = state.peekFirstPending();
    if (!head) {
      // Queue empty - nothing to do
      clearAckTimeout(peerId);
      return;
    }

    if (head.retryCount >= MAX_RETRIES) {
      // Give up - reject all pending messages
      logger.log(
        `${peerId}:: gave up after ${MAX_RETRIES} retries, rejecting ${state.getPendingCount()} pending messages`,
      );
      clearAckTimeout(peerId);
      state.rejectAllPending(`not acknowledged after ${MAX_RETRIES} retries`);
      return;
    }

    // Retry all pending messages
    const channel = state.getChannel();
    if (!channel) {
      // No channel - will be retried during reconnection
      logger.log(
        `${peerId}:: no channel for retry, will retry after reconnection`,
      );
      clearAckTimeout(peerId);
      return;
    }

    // Update head's retry metadata
    head.retryCount += 1;
    head.sendTimestamp = Date.now();
    logger.log(
      `${peerId}:: retransmitting ${state.getPendingCount()} pending messages (attempt ${head.retryCount + 1})`,
    );

    // Retransmit all pending messages
    retransmitAllPending(peerId, channel).catch((error) => {
      outputError(peerId, 'retransmitting pending messages', error);
      handleConnectionLoss(peerId);
    });
  }

  /**
   * Retransmit all pending messages and restart ACK timeout on success.
   *
   * @param peerId - The peer ID.
   * @param channel - The channel to transmit through.
   */
  async function retransmitAllPending(
    peerId: string,
    channel: Channel,
  ): Promise<void> {
    const state = getPeerState(peerId);
    let seq = state.getSeqForPosition(0); // Start seq
    const ack = state.getHighestReceivedSeq();

    // Clear delayed ACK timer - we're piggybacking the ACK on retransmitted messages
    if (ack !== undefined) {
      clearDelayedAck(peerId);
    }

    for (const pending of state.getPendingMessages()) {
      const remoteCommand = {
        seq,
        ...(ack !== undefined && { ack }),
        ...pending.messageBase,
      };
      const message = JSON.stringify(remoteCommand);
      await writeWithTimeout(channel, fromString(message), 10_000);
      seq += 1;
    }

    // All retransmitted successfully - restart ACK timeout
    startAckTimeout(peerId);
  }

  /**
   * Create a pending message entry for ACK tracking.
   *
   * @param messageBase - The message base.
   * @returns Pending message entry with promise kit.
   */
  function createPendingMessage(
    messageBase: RemoteMessageBase,
  ): PendingMessage & { promise: Promise<void> } {
    const { promise, resolve, reject } = makePromiseKit<void>();
    return {
      messageBase,
      sendTimestamp: Date.now(),
      retryCount: 0,
      resolve,
      reject,
      promise,
    };
  }

  /**
   * Send a message with ACK tracking.
   *
   * @param peerId - The peer ID.
   * @param seq - The sequence number.
   * @param messageBase - The message base object.
   * @returns Promise that resolves when ACK is received.
   */
  async function sendWithAck(
    peerId: string,
    seq: number,
    messageBase: RemoteMessageBase,
  ): Promise<void> {
    // Create pending message entry with messageBase (seq/ack added at transmission time)
    const pending = createPendingMessage(messageBase);
    const { promise } = pending;

    const state = getPeerState(peerId);
    const queueWasEmpty = state.getPendingCount() === 0;
    const added = state.addPendingMessage(pending, seq);

    // If queue was at capacity, promise is already rejected - don't send
    if (!added) {
      logger.log(`${peerId}:: message ${seq} rejected (queue at capacity)`);
      return promise;
    }

    // Get or establish channel
    let channel = state.getChannel();
    if (!channel) {
      try {
        const { locationHints: hints } = state;
        channel = await connectionFactory.dialIdempotent(peerId, hints, true);

        // Check if reconnection started during dial
        if (reconnectionManager.isReconnecting(peerId)) {
          // Pending entry already created, will be transmitted during flush
          logger.log(
            `${peerId}:: reconnection started during dial, message ${seq} in pending`,
          );
          return promise;
        }

        state.setChannel(channel);
        readChannel(channel).catch((problem) => {
          outputError(peerId, `reading channel to`, problem);
        });
      } catch (problem) {
        outputError(peerId, `opening connection for message ${seq}`, problem);
        handleConnectionLoss(peerId);
        // Message is pending, will be retried after reconnection
        return promise;
      }
    }

    // Build full message with current seq/ack, then send
    const ack = state.getHighestReceivedSeq();
    const remoteCommand = {
      seq,
      ...(ack !== undefined && { ack }),
      ...messageBase,
    };
    const message = JSON.stringify(remoteCommand);

    // Clear delayed ACK timer - we're piggybacking the ACK on this message
    if (ack !== undefined) {
      clearDelayedAck(peerId);
    }

    try {
      await writeWithTimeout(channel, fromString(message), 10_000);
      // Start ACK timeout if this was the first message in queue
      if (queueWasEmpty) {
        startAckTimeout(peerId);
      }
      reconnectionManager.resetBackoff(peerId);
    } catch (problem) {
      outputError(peerId, `sending message ${seq}`, problem);
      handleConnectionLoss(peerId);
      // Message is pending, will be retried after reconnection
    }

    return promise;
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
   * Receive a message from a peer.
   *
   * @param from - The peer ID that the message is from.
   * @param message - The message to receive.
   */
  async function receiveMessage(from: string, message: string): Promise<void> {
    logger.log(`${from}:: recv ${message.substring(0, 200)}`);

    // Try to parse as JSON to check for standalone ACK
    let isStandaloneAck = false;
    try {
      const parsed = JSON.parse(message) as {
        ack?: number;
        method?: string;
      };

      // Handle ACK-only messages at the network layer
      if (parsed.ack !== undefined && parsed.method === undefined) {
        logger.log(`${from}:: received standalone ACK ${parsed.ack}`);
        await handleAck(from, parsed.ack);
        isStandaloneAck = true;
      }
    } catch {
      // Not valid JSON - will pass to handler below
    }

    // Pass non-ACK messages to handler
    if (!isStandaloneAck) {
      try {
        const reply = await remoteMessageHandler(from, message);
        // Send reply if non-empty
        if (reply) {
          const replyBase = JSON.parse(reply) as RemoteMessageBase;
          // Send the reply as a new message (with its own seq/ack tracking)
          // IMPORTANT: Don't await here! Awaiting would block the read loop and
          // prevent us from receiving the ACK for this reply (deadlock).
          // The reply is sent asynchronously; ACK handling happens when the
          // next message with a piggyback ACK (or standalone ACK) is received.
          sendRemoteMessage(from, replyBase).catch((replyError) => {
            outputError(from, 'sending reply', replyError);
          });
        }
      } catch (handlerError) {
        outputError(from, 'processing received message', handlerError);
      }
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
      if (state.getChannel() === channel) {
        state.clearChannel();
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
    state.clearChannel();

    // Clear ACK timeout during reconnection (will restart after flush)
    clearAckTimeout(peerId);

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
        state.rejectAllPending('remote unreachable');
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
        const hints = state.locationHints;
        const channel = await connectionFactory.dialIdempotent(
          peerId,
          hints,
          false, // No retry here, we're already in a retry loop
        );
        state.setChannel(channel);

        logger.log(`${peerId}:: reconnection successful`);

        // Start reading from the new channel
        readChannel(channel).catch((problem) => {
          outputError(peerId, `reading channel to`, problem);
        });

        await flushQueuedMessages(peerId, channel);

        // Check if channel was deleted during flush (e.g., due to flush errors)
        if (!state.getChannel()) {
          logger.log(
            `${peerId}:: channel deleted during flush, continuing loop`,
          );
          continue; // Continue the reconnection loop
        }

        // Only reset backoff and stop reconnection after successful flush
        startAckTimeout(peerId);
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
          state.rejectAllPending('non-retryable failure');
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
   * Transmits all pending messages (messages awaiting ACK).
   *
   * @param peerId - The peer ID to flush messages for.
   * @param channel - The channel to flush messages through.
   */
  async function flushQueuedMessages(
    peerId: string,
    channel: Channel,
  ): Promise<void> {
    // Transmit all pending messages (messages awaiting ACK, including those queued during reconnection)
    const state = getPeerState(peerId);
    const peerPending = state.getPendingMessages();
    if (peerPending.length > 0) {
      logger.log(
        `${peerId}:: transmitting ${peerPending.length} pending messages`,
      );

      // Pending messages are ordered by sequence number
      let seq = state.getSeqForPosition(0);
      // Get ack once and clear delayed ACK timer (piggybacking on flushed messages)
      const ack = state.getHighestReceivedSeq();
      if (ack !== undefined) {
        clearDelayedAck(peerId);
      }
      for (const pending of peerPending) {
        try {
          logger.log(`${peerId}:: transmit message ${seq}`);
          const remoteCommand = {
            seq,
            ...(ack !== undefined && { ack }),
            ...pending.messageBase,
          };
          const message = JSON.stringify(remoteCommand);
          await writeWithTimeout(channel, fromString(message), 10_000);
          seq += 1;
        } catch (problem) {
          outputError(peerId, `transmitting message ${seq}`, problem);
          // Failed to transmit - connection lost again
          handleConnectionLoss(peerId);
          return;
        }
      }
    }
    // Restart ACK timeout for pending queue after successful flush
    startAckTimeout(peerId);
  }

  /**
   * Send a message to a peer with ACK tracking.
   * Takes a message base (without seq/ack), adds seq and ack fields, and sends with ACK tracking.
   *
   * @param targetPeerId - The peer ID to send the message to.
   * @param messageBase - The base message object (without seq/ack).
   * @returns Promise that resolves when message is ACKed or rejects on failure.
   */
  async function sendRemoteMessage(
    targetPeerId: string,
    messageBase: RemoteMessageBase,
  ): Promise<void> {
    if (signal.aborted) {
      throw Error('Network stopped');
    }

    // Check if peer is intentionally closed
    if (intentionallyClosed.has(targetPeerId)) {
      throw Error('Message delivery failed after intentional close');
    }

    const state = getPeerState(targetPeerId);
    const seq = state.getNextSeq();

    // If reconnecting, create pending entry and return promise
    // Message will be transmitted during reconnection flush
    if (reconnectionManager.isReconnecting(targetPeerId)) {
      logger.log(
        `${targetPeerId}:: adding pending message ${seq} during reconnection`,
      );

      // Create pending entry for ACK tracking
      const pending = createPendingMessage(messageBase);
      state.addPendingMessage(pending, seq);
      return pending.promise;
    }

    // Send with ACK tracking
    return sendWithAck(targetPeerId, seq, messageBase);
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
    getPeerState(channel.peerId).setChannel(channel);
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
    const state = getPeerState(peerId);
    // Remove channel - the readChannel cleanup will handle stream closure
    state.clearChannel();
    if (reconnectionManager.isReconnecting(peerId)) {
      reconnectionManager.stopReconnection(peerId);
    }
    state.rejectAllPending('connection intentionally closed');
    clearAckTimeout(peerId);
    state.clearSequenceNumbers();
  }

  /**
   * Take note of where a peer might be.
   *
   * @param peerId - The peer ID to which this information applies.
   * @param hints - Location hints for the peer.
   */
  function registerLocationHints(peerId: string, hints: string[]): void {
    const state = getPeerState(peerId);
    const oldHints = state.locationHints;
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
   * Handle acknowledgment from a peer (cumulative ACK).
   *
   * @param peerId - The peer ID.
   * @param ackSeq - The highest sequence number being acknowledged.
   */
  async function handleAck(peerId: string, ackSeq: number): Promise<void> {
    const state = getPeerState(peerId);
    state.ackMessages(ackSeq, logger);
    // Restart timeout (or clear if queue is now empty)
    startAckTimeout(peerId);
  }

  /**
   * Update received sequence number for a peer.
   *
   * @param peerId - The peer ID.
   * @param seq - The sequence number received.
   */
  function updateReceivedSeq(peerId: string, seq: number): void {
    getPeerState(peerId).updateReceivedSeq(seq);
    // Start delayed ACK timer - will send standalone ACK if no outgoing message
    startDelayedAck(peerId);
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
    // Reject all pending messages for all peers
    for (const peerId of peerStates.keys()) {
      getPeerState(peerId).rejectAllPending('network stopped');
    }
    // Clear all ACK timeouts
    for (const timeout of ackTimeouts.values()) {
      clearTimeout(timeout);
    }
    ackTimeouts.clear();
    // Clear all delayed ACK timeouts
    for (const timeout of delayedAckTimeouts.values()) {
      clearTimeout(timeout);
    }
    delayedAckTimeouts.clear();
    // Close all active channel streams to unblock pending reads
    for (const state of peerStates.values()) {
      const channel = state.getChannel();
      if (channel) {
        try {
          // Close the stream to unblock any pending read operations
          const stream = channel.msgStream.unwrap() as { close?: () => void };
          stream.close?.();
        } catch {
          // Ignore errors during cleanup
        }
        state.clearChannel();
      }
    }
    await connectionFactory.stop();
    peerStates.clear();
    reconnectionManager.clear();
    intentionallyClosed.clear();
  }

  // Return the sender with a stop handle and connection management functions
  return {
    sendRemoteMessage,
    stop,
    closeConnection,
    registerLocationHints,
    reconnectPeer,
    handleAck,
    updateReceivedSeq,
  };
}
