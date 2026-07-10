import { Logger } from '@metamask/logger';
import {
  DEFAULT_MAX_MESSAGE_SIZE_BYTES,
  makeChannelNetlayer,
} from '@metamask/netlayer';
import type { Netlayer } from '@metamask/netlayer';

import { ConnectionFactory } from './connection-factory.ts';
import type {
  RemoteMessageHandler,
  OnRemoteGiveUp,
  OnIncarnationChange,
  RemoteCommsOptions,
} from '../types.ts';

/**
 * Initialize the remote comm system with information that must be provided by the kernel.
 *
 * Thin, signature-compatible wrapper: constructs the libp2p
 * {@link ConnectionFactory} provider and delegates the engine to
 * `makeChannelNetlayer` from `@metamask/netlayer`, sharing one `Logger` and one
 * `AbortController`. The libp2p-specific provider options (`relays`,
 * `directTransports`, `allowedWsHosts`) are consumed here; the rest map onto the
 * engine's neutral options.
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
 * @param localIncarnationId - This kernel's incarnation ID for handshake protocol.
 * @param onIncarnationChange - Optional callback when a remote peer's incarnation changes (peer restarted).
 *
 * @returns a {@link Netlayer}: a function to send messages **and** a `stop()` to cancel/release everything.
 */
export async function initTransport(
  keySeed: string,
  options: RemoteCommsOptions,
  remoteMessageHandler: RemoteMessageHandler,
  onRemoteGiveUp?: OnRemoteGiveUp,
  localIncarnationId?: string,
  onIncarnationChange?: OnIncarnationChange,
): Promise<Netlayer> {
  const {
    relays = [],
    maxRetryAttempts,
    maxConcurrentConnections,
    maxMessageSizeBytes,
    cleanupIntervalMs,
    stalePeerTimeoutMs,
    maxMessagesPerSecond,
    maxConnectionAttemptsPerMinute,
    reconnectionBaseDelayMs,
    reconnectionMaxDelayMs,
    handshakeTimeoutMs,
    writeTimeoutMs,
    streamInactivityTimeoutMs,
    directTransports,
    allowedWsHosts,
  } = options;
  const logger = new Logger();
  const stopController = new AbortController();
  const provider = await ConnectionFactory.make({
    keySeed,
    knownRelays: relays,
    logger,
    signal: stopController.signal,
    maxRetryAttempts,
    maxMessageSizeBytes: maxMessageSizeBytes ?? DEFAULT_MAX_MESSAGE_SIZE_BYTES,
    directTransports,
    allowedWsHosts,
  });
  return makeChannelNetlayer({
    provider,
    hooks: {
      handleMessage: remoteMessageHandler,
      onRemoteGiveUp,
      onIncarnationChange,
    },
    options: {
      maxRetryAttempts,
      maxConcurrentConnections,
      maxMessageSizeBytes,
      cleanupIntervalMs,
      stalePeerTimeoutMs,
      maxMessagesPerSecond,
      maxConnectionAttemptsPerMinute,
      reconnectionBaseDelayMs,
      reconnectionMaxDelayMs,
      handshakeTimeoutMs,
      writeTimeoutMs,
      streamInactivityTimeoutMs,
      localIncarnationId,
    },
    logger,
    stopController,
  });
}
