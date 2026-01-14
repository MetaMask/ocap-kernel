import { ResourceLimitError } from '@metamask/kernel-errors';
import { installWakeDetector } from '@metamask/kernel-utils';
import { Logger } from '@metamask/logger';
import { fromString } from 'uint8arrays';

import { makeChannelReader } from './channel-reader.ts';
import { reuseOrReturnChannel } from './channel-utils.ts';
import { ConnectionFactory } from './connection-factory.ts';
import { PeerRegistry } from './peer-registry.ts';
import { makeReconnectionOrchestrator } from './reconnection-orchestrator.ts';
import { ReconnectionManager } from './reconnection.ts';
import type {
  RemoteMessageHandler,
  SendRemoteMessage,
  StopRemoteComms,
  Channel,
  OnRemoteGiveUp,
  RemoteCommsOptions,
} from '../types.ts';

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
  const messageEncoder = new TextEncoder();
  let cleanupIntervalId: ReturnType<typeof setInterval> | undefined;

  // Initialize components
  const peerRegistry = new PeerRegistry(maxQueue);
  const reconnectionManager = new ReconnectionManager();
  const connectionFactory = await ConnectionFactory.make(
    keySeed,
    relays,
    logger,
    signal,
    maxRetryAttempts,
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
      if (abortHandler) {
        timeoutSignal.removeEventListener('abort', abortHandler);
      }
    }
  }

  /**
   * Check if we can establish a new connection (within connection limit).
   *
   * @throws ResourceLimitError if connection limit is reached.
   */
  function checkConnectionLimit(): void {
    const currentConnections = peerRegistry.channelCount;
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
   * Validate message size before sending or queuing.
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

  // Late-bound references for circular dependencies
  // eslint-disable-next-line prefer-const
  let channelReader: ReturnType<typeof makeChannelReader>;
  // eslint-disable-next-line prefer-const
  let reconnectionOrchestrator: ReturnType<typeof makeReconnectionOrchestrator>;

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
    const previousChannel = peerRegistry.setChannel(peerId, channel);
    channelReader.readChannel(channel).catch((problem) => {
      outputError(peerId, errorContext, problem);
    });

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

  // Create channel reader
  channelReader = makeChannelReader({
    peerRegistry,
    remoteMessageHandler,
    signal,
    logger,
    onConnectionLoss: (peerId, channel) =>
      reconnectionOrchestrator.handleConnectionLoss(peerId, channel),
    onMessageReceived: (peerId) => reconnectionManager.resetBackoff(peerId),
    outputError,
  });

  // Create reconnection orchestrator
  reconnectionOrchestrator = makeReconnectionOrchestrator({
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
  });

  /**
   * Clean up stale peer data for peers inactive for more than stalePeerTimeoutMs.
   */
  function cleanupStalePeers(): void {
    const stalePeers = peerRegistry.findStalePeers(
      stalePeerTimeoutMs,
      (peerId) => reconnectionManager.isReconnecting(peerId),
    );

    const now = Date.now();
    for (const peerId of stalePeers) {
      const lastTime = peerRegistry.getLastConnectionTime(peerId);
      if (lastTime !== undefined) {
        const minutesSinceActivity = Math.round((now - lastTime) / 1000 / 60);
        logger.log(
          `${peerId}:: cleaning up stale peer data (inactive for ${minutesSinceActivity} minutes)`,
        );
      }
      peerRegistry.removePeer(peerId);
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

    validateMessageSize(message);

    if (peerRegistry.isIntentionallyClosed(targetPeerId)) {
      throw new Error('Message delivery failed after intentional close');
    }

    const queue = peerRegistry.getMessageQueue(targetPeerId);

    if (reconnectionManager.isReconnecting(targetPeerId)) {
      queue.enqueue(message);
      logger.log(
        `${targetPeerId}:: queueing message during reconnection ` +
          `(${queue.length}/${maxQueue}): ${message}`,
      );
      return;
    }

    let channel: Channel | null | undefined =
      peerRegistry.getChannel(targetPeerId);
    if (!channel) {
      checkConnectionLimit();

      try {
        const hints = peerRegistry.getLocationHints(targetPeerId);
        channel = await connectionFactory.dialIdempotent(
          targetPeerId,
          hints,
          true,
        );

        const currentQueue = peerRegistry.getMessageQueue(targetPeerId);

        if (reconnectionManager.isReconnecting(targetPeerId)) {
          currentQueue.enqueue(message);
          logger.log(
            `${targetPeerId}:: reconnection started during dial, queueing message ` +
              `(${currentQueue.length}/${maxQueue}): ${message}`,
          );
          await connectionFactory.closeChannel(channel, targetPeerId);
          return;
        }

        channel = await reuseOrReturnChannel(
          targetPeerId,
          channel,
          peerRegistry,
          connectionFactory,
        );
        if (channel === null) {
          logger.log(
            `${targetPeerId}:: existing channel died during reuse check, triggering reconnection`,
          );
          currentQueue.enqueue(message);
          reconnectionOrchestrator.handleConnectionLoss(targetPeerId);
          return;
        }

        const registeredChannel = peerRegistry.getChannel(targetPeerId);
        if (registeredChannel) {
          if (channel !== registeredChannel) {
            await connectionFactory.closeChannel(channel, targetPeerId);
          }
          channel = registeredChannel;
        } else {
          try {
            checkConnectionLimit();
          } catch (limitError) {
            logger.log(
              `${targetPeerId}:: connection limit reached after dial, rejecting send`,
            );
            await connectionFactory.closeChannel(channel, targetPeerId);
            throw limitError;
          }

          if (peerRegistry.isIntentionallyClosed(targetPeerId)) {
            logger.log(
              `${targetPeerId}:: peer intentionally closed during dial, closing channel`,
            );
            await connectionFactory.closeChannel(channel, targetPeerId);
            throw new Error('Message delivery failed after intentional close');
          }

          registerChannel(targetPeerId, channel);
        }
      } catch (problem) {
        if (problem instanceof ResourceLimitError) {
          throw problem;
        }
        if (
          problem instanceof Error &&
          problem.message === 'Message delivery failed after intentional close'
        ) {
          throw problem;
        }
        outputError(targetPeerId, `opening connection`, problem);
        reconnectionOrchestrator.handleConnectionLoss(targetPeerId);
        const currentQueue = peerRegistry.getMessageQueue(targetPeerId);
        currentQueue.enqueue(message);
        return;
      }
    }

    try {
      logger.log(`${targetPeerId}:: send ${message}`);
      await writeWithTimeout(channel, fromString(message), 10_000);
      reconnectionManager.resetBackoff(targetPeerId);
      peerRegistry.updateLastConnectionTime(targetPeerId);
    } catch (problem) {
      outputError(targetPeerId, `sending message`, problem);
      reconnectionOrchestrator.handleConnectionLoss(targetPeerId, channel);
      const currentQueue = peerRegistry.getMessageQueue(targetPeerId);
      currentQueue.enqueue(message);

      const newChannel = peerRegistry.getChannel(targetPeerId);
      if (newChannel && newChannel !== channel) {
        logger.log(
          `${targetPeerId}:: stale channel replaced, flushing queue on new channel`,
        );
        await reconnectionOrchestrator.flushQueuedMessages(
          targetPeerId,
          newChannel,
          currentQueue,
        );
      }
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
    if (peerRegistry.isIntentionallyClosed(channel.peerId)) {
      logger.log(
        `${channel.peerId}:: rejecting inbound connection from intentionally closed peer`,
      );
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

    if (!peerRegistry.hasChannel(channel.peerId)) {
      try {
        checkConnectionLimit();
      } catch {
        logger.log(
          `${channel.peerId}:: rejecting inbound connection due to connection limit`,
        );
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
   *
   * @param peerId - The peer ID to close the connection for.
   */
  async function closeConnection(peerId: string): Promise<void> {
    logger.log(`${peerId}:: explicitly closing connection`);
    peerRegistry.markIntentionallyClosed(peerId);
    const channel = peerRegistry.getChannel(peerId);
    peerRegistry.removeChannel(peerId);
    if (reconnectionManager.isReconnecting(peerId)) {
      reconnectionManager.stopReconnection(peerId);
    }
    const queue = peerRegistry.getMessageQueue(peerId);
    queue.clear();
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
    peerRegistry.registerLocationHints(peerId, hints);
  }

  /**
   * Manually reconnect to a peer after intentional close.
   *
   * @param peerId - The peer ID to reconnect to.
   * @param hints - The hints to use for the reconnection.
   */
  async function reconnectPeer(
    peerId: string,
    hints: string[] = [],
  ): Promise<void> {
    logger.log(`${peerId}:: manually reconnecting after intentional close`);
    peerRegistry.clearIntentionallyClosed(peerId);
    if (reconnectionManager.isReconnecting(peerId)) {
      return;
    }
    registerLocationHints(peerId, hints);
    reconnectionOrchestrator.handleConnectionLoss(peerId);
  }

  /**
   * Stop the network.
   */
  async function stop(): Promise<void> {
    logger.log('Stopping kernel network...');
    if (cleanupWakeDetector) {
      cleanupWakeDetector();
      cleanupWakeDetector = undefined;
    }
    if (cleanupIntervalId) {
      clearInterval(cleanupIntervalId);
      cleanupIntervalId = undefined;
    }
    stopController.abort();
    await connectionFactory.stop();
    peerRegistry.clear();
    reconnectionManager.clear();
  }

  return {
    sendRemoteMessage,
    stop,
    closeConnection,
    registerLocationHints,
    reconnectPeer,
  };
}
