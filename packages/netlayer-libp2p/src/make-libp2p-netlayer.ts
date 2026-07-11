import { Logger } from '@metamask/logger';
import {
  DEFAULT_MAX_MESSAGE_SIZE_BYTES,
  makeChannelNetlayer,
} from '@metamask/netlayer';
import type { Netlayer, NetlayerParams } from '@metamask/netlayer';

import type { Libp2pNetlayerConfig } from './config.ts';
import { ConnectionFactory } from './connection-factory.ts';
import type { DirectTransport } from './types.ts';

/**
 * Parameters for {@link makeLibp2pNetlayer}: the neutral {@link NetlayerParams}
 * for the libp2p config, plus an optional pre-built set of direct transports.
 */
export type MakeLibp2pNetlayerParams = NetlayerParams<Libp2pNetlayerConfig> & {
  /**
   * Pre-built direct (QUIC/TCP) transports. The `./nodejs` factory builds
   * these from `config.directListenAddresses`; the ocap-kernel compatibility
   * shim forwards transports built by its own platform layer. Not `Json` and
   * never crosses the browser `postMessage` boundary.
   *
   * @internal
   */
  directTransports?: DirectTransport[] | undefined;
};

/**
 * Construct a libp2p {@link Netlayer}: build the libp2p `ConnectionFactory`
 * (the `ChannelProvider`) from the config and key seed, then delegate the
 * channel-session engine to `makeChannelNetlayer`, sharing one `Logger` and one
 * `AbortController` (so the netlayer's `stop()` aborts the signal the provider
 * was constructed with). Provider-owned config (`knownRelays`, `allowedWsHosts`,
 * `maxMessageSizeBytes`, `maxRetryAttempts`, `directTransports`) is consumed by
 * the factory; the remaining engine options flow to `makeChannelNetlayer`.
 *
 * @param params - The netlayer parameters. See {@link MakeLibp2pNetlayerParams}.
 * @param params.keySeed - Hex-encoded key seed the peer id is derived from.
 * @param params.incarnationId - This kernel's incarnation id.
 * @param params.hooks - Kernel-supplied callbacks.
 * @param params.config - The libp2p netlayer config.
 * @param params.logger - Optional logger; a new one is created if omitted.
 * @param params.directTransports - Optional pre-built direct transports.
 * @returns A promise for the constructed {@link Netlayer}.
 */
export async function makeLibp2pNetlayer({
  keySeed,
  incarnationId,
  hooks,
  config,
  logger,
  directTransports,
}: MakeLibp2pNetlayerParams): Promise<Netlayer> {
  const {
    knownRelays = [],
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
    allowedWsHosts,
  } = config;
  const resolvedLogger = logger ?? new Logger();
  const stopController = new AbortController();
  const provider = await ConnectionFactory.make({
    keySeed,
    knownRelays,
    logger: resolvedLogger,
    signal: stopController.signal,
    maxRetryAttempts,
    maxMessageSizeBytes: maxMessageSizeBytes ?? DEFAULT_MAX_MESSAGE_SIZE_BYTES,
    directTransports,
    allowedWsHosts,
  });
  return makeChannelNetlayer({
    provider,
    hooks,
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
      localIncarnationId: incarnationId,
    },
    logger: resolvedLogger,
    stopController,
  });
}
harden(makeLibp2pNetlayer);
