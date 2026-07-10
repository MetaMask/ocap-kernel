import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { bootstrap } from '@libp2p/bootstrap';
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2';
import { generateKeyPairFromSeed, publicKeyFromRaw } from '@libp2p/crypto/keys';
import { identify } from '@libp2p/identify';
import {
  MuxerClosedError,
  StreamResetError,
  TooManyOutboundProtocolStreamsError,
} from '@libp2p/interface';
import type {
  PrivateKey,
  Libp2p,
  Stream,
  StreamCloseEvent,
} from '@libp2p/interface';
import { peerIdFromPublicKey } from '@libp2p/peer-id';
import { ping } from '@libp2p/ping';
import {
  InvalidDataLengthError,
  InvalidDataLengthLengthError,
  lpStream,
} from '@libp2p/utils';
import { webRTC } from '@libp2p/webrtc';
import { webSockets } from '@libp2p/websockets';
import { webTransport } from '@libp2p/webtransport';
import {
  AbortError,
  ChannelResetError,
  IntentionalDisconnectError,
  isRetryableNetworkError,
  MessageTooLargeError,
} from '@metamask/kernel-errors';
import {
  calculateReconnectionBackoff,
  fromHex,
  retryWithBackoff,
} from '@metamask/kernel-utils';
import { Logger } from '@metamask/logger';
import {
  DEFAULT_MAX_MESSAGE_SIZE_BYTES,
  deriveNeutralPeerId,
  neutralPeerIdToPublicKey,
  publicKeyToNeutralPeerId,
} from '@metamask/netlayer';
import type {
  InboundChannelHandler,
  NetworkChannel,
  PeerDisconnectHandler,
} from '@metamask/netlayer';
import { multiaddr } from '@multiformats/multiaddr';
import type { Multiaddr } from '@multiformats/multiaddr';
import { createLibp2p } from 'libp2p';

import {
  RELAY_RECONNECT_BASE_DELAY_MS,
  RELAY_RECONNECT_MAX_DELAY_MS,
  RELAY_RECONNECT_MAX_ATTEMPTS,
  SCTP_USER_INITIATED_ABORT,
} from './constants.ts';
import { getHost, getLastPeerId, isPlainWs } from '../../utils/multiaddr.ts';
import { isPrivateAddress } from '../../utils/network.ts';
import type { ConnectionFactoryOptions, DirectTransport } from '../types.ts';

/**
 * Detect whether a read error indicates an intentional disconnect. Checks the
 * legacy SCTP sniffing for a WebRTC user-initiated abort (code 12). The typed
 * `StreamResetError` is handled separately (mapped to `ChannelResetError`) so a
 * remote reset always reconnects and is never treated as intentional.
 *
 * @param problem - The error thrown by a stream read.
 * @returns Whether the error represents an intentional disconnect.
 */
function isIntentionalDisconnect(problem: unknown): boolean {
  const rtcProblem = problem as {
    errorDetail?: string;
    sctpCauseCode?: number;
  };
  return (
    rtcProblem?.errorDetail === 'sctp-failure' &&
    rtcProblem?.sctpCauseCode === SCTP_USER_INITIATED_ABORT
  );
}

/**
 * Map a raw libp2p stream-read error onto a neutral kernel-error so the channel
 * engine never imports libp2p error types. Ordering mirrors the historical
 * engine cascade: a `StreamResetError` maps to `ChannelResetError` (reconnect)
 * before intentional-disconnect classification, so a remote reset can never be
 * swallowed as an intentional close. Anything unrecognised (including
 * `UnexpectedEOFError`) passes through unchanged for the engine's else branch.
 *
 * @param problem - The raw error thrown by the underlying stream read.
 * @returns The neutral error to throw, or the original error unchanged.
 */
function mapLibp2pReadError(problem: unknown): unknown {
  if (
    problem instanceof InvalidDataLengthError ||
    problem instanceof InvalidDataLengthLengthError
  ) {
    return new MessageTooLargeError({ cause: problem });
  }
  if (problem instanceof StreamResetError) {
    return new ChannelResetError({ cause: problem });
  }
  if (isIntentionalDisconnect(problem)) {
    return new IntentionalDisconnectError({ cause: problem as Error });
  }
  return problem;
}

/**
 * Connection factory for libp2p network operations.
 * Handles libp2p initialization, dialing, and connection management.
 */
export class ConnectionFactory {
  #libp2p?: Libp2p;

  readonly #inflightDials = new Map<string, Promise<NetworkChannel>>();

  readonly #logger: Logger;

  readonly #signal: AbortSignal;

  readonly #knownRelays: string[];

  readonly #keySeed: string;

  readonly #neutralPeerId: string;

  readonly #maxRetryAttempts: number;

  readonly #maxDataLength: number;

  readonly #directTransports: DirectTransport[];

  readonly #allowedWsHosts: string[];

  readonly #relayPeerIds = new Set<string>();

  readonly #relayMultiaddrs = new Map<string, string>();

  readonly #pendingRelayReconnects = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();

  #stopped = false;

  #inboundHandler?: InboundChannelHandler;

  #disconnectHandler?: PeerDisconnectHandler;

  /**
   * Constructor for the ConnectionFactory.
   *
   * @param options - The options for the ConnectionFactory.
   * @param options.keySeed - The key seed to use for the libp2p node.
   * @param options.knownRelays - The known relays to use for the libp2p node.
   * @param options.logger - The logger to use for the libp2p node.
   * @param options.signal - The signal to use for the libp2p node.
   * @param options.maxRetryAttempts - Maximum number of reconnection attempts. 0 = infinite (default).
   * @param options.maxMessageSizeBytes - Maximum inbound message size in bytes, used as `maxDataLength` on every `lpStream`. Defaults to 1 MB.
   * @param options.directTransports - Optional direct transports (e.g. QUIC, TCP) with listen addresses.
   * @param options.allowedWsHosts - Hostnames/IPs allowed for plain ws:// connections beyond private ranges.
   */
  // eslint-disable-next-line no-restricted-syntax
  private constructor(options: ConnectionFactoryOptions) {
    this.#keySeed = options.keySeed;
    this.#neutralPeerId = deriveNeutralPeerId(fromHex(options.keySeed));
    this.#knownRelays = options.knownRelays;
    this.#logger = options.logger;
    this.#signal = options.signal;
    this.#maxRetryAttempts = options.maxRetryAttempts ?? 0;
    this.#maxDataLength =
      options.maxMessageSizeBytes ?? DEFAULT_MAX_MESSAGE_SIZE_BYTES;
    this.#directTransports = options.directTransports ?? [];
    const explicitHosts = options.allowedWsHosts ?? [];
    const relayHosts: string[] = [];

    for (const relay of this.#knownRelays) {
      try {
        const ma = multiaddr(relay);
        const peerId = getLastPeerId(ma);
        if (peerId) {
          this.#relayPeerIds.add(peerId);
          this.#relayMultiaddrs.set(peerId, relay);
        } else {
          this.#logger.warn(
            `relay address lacks /p2p/<peerId> suffix, reconnection disabled: ${relay}`,
          );
        }
        // Auto-allow the relay host for plain ws:// connections
        if (isPlainWs(ma)) {
          const host = getHost(ma);
          if (host) {
            relayHosts.push(host);
          }
        }
      } catch (error) {
        this.#logger.warn(`skipping malformed relay address: ${relay}`, error);
      }
    }

    this.#allowedWsHosts = [...new Set([...explicitHosts, ...relayHosts])];
  }

  /**
   * Create a new ConnectionFactory instance.
   *
   * @param options - The options for the ConnectionFactory.
   * @param options.keySeed - The key seed to use for the libp2p node.
   * @param options.knownRelays - The known relays to use for the libp2p node.
   * @param options.logger - The logger to use for the libp2p node.
   * @param options.signal - The signal to use for the libp2p node.
   * @param options.maxRetryAttempts - Maximum number of reconnection attempts. 0 = infinite (default).
   * @param options.maxMessageSizeBytes - Maximum inbound message size in bytes, used as `maxDataLength` on every `lpStream`. Defaults to 1 MB.
   * @param options.directTransports - Optional direct transports (e.g. QUIC, TCP) with listen addresses.
   * @param options.allowedWsHosts - Hostnames/IPs allowed for plain ws:// connections beyond private ranges.
   * @returns A promise for the new ConnectionFactory instance.
   */
  static async make(
    options: ConnectionFactoryOptions,
  ): Promise<ConnectionFactory> {
    const factory = new ConnectionFactory(options);
    await factory.#init();
    return factory;
  }

  /**
   * Initialize libp2p with the provided configuration.
   */
  async #init(): Promise<void> {
    const privateKey = await this.#generateKeyInfo();

    this.#libp2p = await createLibp2p({
      privateKey,
      addresses: {
        listen: [
          '/webrtc',
          '/p2p-circuit',
          ...this.#directTransports.flatMap((dt) => dt.listenAddresses),
        ],
        appendAnnounce: ['/webrtc'],
      },
      transports: [
        webSockets(),
        webTransport(),
        webRTC({
          rtcConfiguration: {
            iceServers: [
              {
                urls: [
                  'stun:stun.l.google.com:19302',
                  'stun:global.stun.twilio.com:3478',
                ],
              },
            ],
          },
        }),
        circuitRelayTransport(),
        ...this.#directTransports.map(
          (dt) => dt.transport as ReturnType<typeof webSockets>,
        ),
      ],
      connectionEncrypters: [noise()],
      streamMuxers: [yamux()],
      connectionGater: {
        denyDialMultiaddr: async (ma: Multiaddr) => {
          if (!isPlainWs(ma)) {
            return false; // allow wss://, webRTC, circuit relay, etc.
          }
          const host = getHost(ma) ?? '';
          if (isPrivateAddress(host) || this.#allowedWsHosts.includes(host)) {
            return false;
          }
          return true; // deny plain ws:// to unrecognised public addresses
        },
      },
      // No peer discovery in direct connection mode
      ...(this.#knownRelays.length > 0
        ? {
            peerDiscovery: [
              bootstrap({
                list: this.#knownRelays,
              }),
            ],
          }
        : {}),
      services: {
        identify: identify(),
        ping: ping(),
      },
    });

    // Set up inbound handler
    await this.#libp2p.handle('whatever', async (stream, connection) => {
      const libp2pPeerId = connection.remotePeer.toString();
      const connType = connection.direct ? 'direct' : 'relayed';
      this.#logger.log(
        `inbound ${connType} connection from peerId:${libp2pPeerId}`,
      );

      // Our peers are Ed25519, noise-authenticated, so the raw public key is
      // present; convert it to the neutral id the transport layer expects. If
      // it is ever absent, drop the connection rather than fabricate an id.
      const { publicKey } = connection.remotePeer;
      if (!publicKey) {
        this.#logger.error(
          `inbound connection from ${libp2pPeerId} lacks a public key, dropping`,
        );
        return;
      }
      const remotePeerId = publicKeyToNeutralPeerId(publicKey.raw);

      const channel = this.#makeNetworkChannel(stream, remotePeerId);

      await this.#inboundHandler?.(channel);
    });

    // Start libp2p
    this.#logger.log(
      `Starting libp2p node with peerId: ${this.#libp2p.peerId.toString()}`,
    );
    this.#logger.log(`Connecting to relays: ${this.#knownRelays.join(', ')}`);

    this.#libp2p.addEventListener('self:peer:update', (evt) => {
      this.#logger.log(`Peer update: ${JSON.stringify(evt.detail)}`);
    });

    this.#libp2p.addEventListener('connection:close', (evt) => {
      const remotePeerId = evt.detail.remotePeer.toString();
      if (this.#relayPeerIds.has(remotePeerId)) {
        this.#logger.log(
          `relay ${remotePeerId} connection closed, scheduling reconnect`,
        );
        this.#scheduleRelayReconnect(remotePeerId);
      }
    });

    this.#libp2p.addEventListener('peer:disconnect', (evt) => {
      // evt.detail is a libp2p PeerId; #relayPeerIds is keyed by libp2p id, so
      // the relay-suppression guard stays in libp2p-id space.
      const libp2pPeerId = evt.detail.toString();
      this.#logger.log(
        `peer disconnected (all connections closed): ${libp2pPeerId}`,
      );
      // Don't forward relay disconnects — handled by #scheduleRelayReconnect
      if (this.#relayPeerIds.has(libp2pPeerId)) {
        return;
      }
      // The transport layer only knows neutral ids, so convert before forwarding.
      const { publicKey } = evt.detail;
      if (!publicKey) {
        this.#logger.error(
          `peer:disconnect for ${libp2pPeerId} lacks a public key, cannot forward`,
        );
        return;
      }
      this.#disconnectHandler?.(publicKeyToNeutralPeerId(publicKey.raw));
    });

    await this.#libp2p.start();

    // Schedule reconnection for any relay that was not reachable on startup.
    const startupConnectedPeerIds = new Set(
      this.#libp2p.getConnections().map((conn) => conn.remotePeer.toString()),
    );
    for (const relayPeerId of this.#relayPeerIds) {
      if (!startupConnectedPeerIds.has(relayPeerId)) {
        this.#logger.log(
          `relay ${relayPeerId} not connected after startup, scheduling reconnect`,
        );
        this.#scheduleRelayReconnect(relayPeerId);
      }
    }
  }

  /**
   * Build a transport-neutral {@link NetworkChannel} wrapping a libp2p stream.
   * Owns the length-prefixed framing, the inactivity-timeout setter, the
   * diagnostic close-event listener, the write not-open short-circuit, and
   * read-error mapping to neutral kernel-errors.
   *
   * @param stream - The libp2p stream to wrap.
   * @param peerId - The remote peer's id.
   * @returns The neutral channel.
   */
  #makeNetworkChannel(stream: Stream, peerId: string): NetworkChannel {
    const msgStream = lpStream(stream, { maxDataLength: this.#maxDataLength });
    // Listen for v3 fine-grained close events for diagnostics.
    stream.addEventListener(
      'close',
      (evt: Event) => {
        const { local, error } = evt as StreamCloseEvent;
        if (local) {
          const suffix = error ? `: ${error.message}` : '';
          this.#logger.log(`${peerId}:: stream closed locally${suffix}`);
        } else if (error) {
          this.#logger.log(
            `${peerId}:: stream reset by remote: ${error.message}`,
          );
        } else {
          this.#logger.log(`${peerId}:: stream closed by remote (clean)`);
        }
      },
      { once: true },
    );
    return harden({
      peerId,
      read: async (): Promise<Uint8Array> => {
        try {
          const readBuf = await msgStream.read();
          return readBuf.subarray();
        } catch (problem) {
          throw mapLibp2pReadError(problem);
        }
      },
      write: async (data: Uint8Array): Promise<void> => {
        // Short-circuit if the underlying stream is already closed/aborted/reset
        if (stream.status !== 'open') {
          throw Error(`Stream is ${stream.status}, cannot write`);
        }
        await msgStream.write(data);
      },
      close: async (): Promise<void> => this.#closeStream(stream, peerId),
      setInactivityTimeout: (ms: number): void => {
        // Distinct from the per-write timeout — it covers bidirectional
        // silence across the stream's lifetime.
        stream.inactivityTimeout = ms;
      },
    });
  }

  /**
   * The neutral peer id this provider authenticates as (base58btc of the raw
   * Ed25519 public key derived from the key seed).
   *
   * @returns The neutral peer id.
   */
  get peerId(): string {
    return this.#neutralPeerId;
  }

  /**
   * Set the handler for inbound channels.
   *
   * @param handler - The handler for inbound channels.
   */
  onInboundChannel(handler: InboundChannelHandler): void {
    this.#inboundHandler = handler;
  }

  /**
   * Set the handler for peer disconnect events.
   * Fires when all connections to a peer are closed.
   *
   * @param handler - The handler for peer disconnects.
   */
  onPeerDisconnect(handler: PeerDisconnectHandler): void {
    this.#disconnectHandler = handler;
  }

  /**
   * Get the listen addresses of the libp2p node.
   * These are the multiaddr strings that other peers can use to dial this node.
   *
   * @returns The listen address strings.
   */
  getListenAddresses(): string[] {
    if (!this.#libp2p) {
      return [];
    }
    return this.#libp2p.getMultiaddrs().map((ma) => ma.toString());
  }

  /**
   * Generate key info from the seed.
   *
   * @returns The key info.
   */
  async #generateKeyInfo(): Promise<PrivateKey> {
    const keyPair = await generateKeyPairFromSeed(
      'Ed25519',
      fromHex(this.#keySeed),
    );
    return keyPair;
  }

  /**
   * Convert a neutral peer id to the libp2p PeerId string used inside
   * multiaddrs (`/p2p/<id>`) and compared against `connection.remotePeer`.
   *
   * @param neutralId - The neutral (base58btc raw-pubkey) peer id.
   * @returns The libp2p PeerId string.
   */
  #toLibp2pPeerId(neutralId: string): string {
    const publicKey = publicKeyFromRaw(neutralPeerIdToPublicKey(neutralId));
    return peerIdFromPublicKey(publicKey).toString();
  }

  /**
   * Get candidate address strings for dialing a peer.
   *
   * @param peerId - The libp2p peer ID to get candidate address strings for.
   * @param hints - The hints to get candidate address strings for.
   * @returns The candidate address strings.
   */
  candidateAddressStrings(peerId: string, hints: string[]): string[] {
    const directAddresses: string[] = [];
    const relayHints: string[] = [];

    for (const hint of hints) {
      try {
        if (getLastPeerId(multiaddr(hint)) === peerId) {
          directAddresses.push(hint);
        } else {
          relayHints.push(hint);
        }
      } catch {
        // Skip malformed hints so relay fallback still works.
        this.#logger.log(`skipping malformed hint: ${hint}`);
      }
    }

    const possibleRelays = relayHints.concat(
      ...this.#knownRelays.filter((relay) => !relayHints.includes(relay)),
    );

    // Direct addresses first, then WebRTC via relay, then WebSocket via relay.
    const relayAddresses = possibleRelays.flatMap((relay) => [
      `${relay}/p2p-circuit/webrtc/p2p/${peerId}`,
      `${relay}/p2p-circuit/p2p/${peerId}`,
    ]);

    return [...directAddresses, ...relayAddresses];
  }

  /**
   * Single-attempt channel open (no backoff here).
   * Throws if all strategies fail.
   *
   * @param peerId - The libp2p peer ID to dial (used for multiaddrs).
   * @param hints - The hints to open a channel for.
   * @param neutralPeerId - The neutral peer ID to stamp on the returned
   *   channel. Defaults to `peerId` for direct callers/tests that pass a single
   *   id; `dial` passes the neutral id explicitly.
   * @returns The channel.
   */
  async openChannelOnce(
    peerId: string,
    hints: string[] = [],
    neutralPeerId: string = peerId,
  ): Promise<NetworkChannel> {
    if (!this.#libp2p) {
      throw new Error('libp2p not initialized');
    }

    const addresses = this.candidateAddressStrings(peerId, hints);
    // Combine shutdown signal with a per-dial timeout
    const signalTimeout = AbortSignal.timeout(30_000);

    let lastError: Error | undefined;

    for (const addressString of addresses) {
      if (this.#signal.aborted) {
        throw new AbortError();
      }
      try {
        const connectToAddr = multiaddr(addressString);
        this.#logger.log(`contacting ${peerId} via ${addressString}`);
        const stream = await this.#libp2p.dialProtocol(
          connectToAddr,
          'whatever',
          {
            signal: signalTimeout,
          },
        );
        this.#logger.log(
          `successfully connected to ${peerId} via ${addressString}`,
        );
        const channel = this.#makeNetworkChannel(stream, neutralPeerId);
        this.#logger.log(`opened channel to ${peerId}`);
        return channel;
      } catch (problem) {
        lastError = problem as Error;
        if (this.#signal.aborted) {
          throw new AbortError();
        }
        if (problem instanceof MuxerClosedError) {
          this.#outputError(
            peerId,
            `yamux muxer issue contacting via ${addressString}`,
            problem,
          );
        } else if (problem instanceof TooManyOutboundProtocolStreamsError) {
          // Local stream limit hit — trying other addresses won't help
          this.#outputError(
            peerId,
            `too many outbound streams via ${addressString}`,
            problem,
          );
          throw problem;
        } else if (signalTimeout.aborted) {
          this.#outputError(peerId, `timed out opening channel`, problem);
        } else {
          this.#outputError(peerId, `issue opening channel`, problem);
        }
      }
    }

    throw lastError ?? new Error(`unable to open channel to ${peerId}`);
  }

  /**
   * Backoff-capable open (useful for initial connect).
   *
   * @param peerId - The libp2p peer ID to dial (used for multiaddrs).
   * @param hints - The hints to open a channel for.
   * @param neutralPeerId - The neutral peer ID to stamp on the returned channel.
   *   Defaults to `peerId`; `dial` passes the neutral id explicitly.
   * @returns The channel.
   */
  async openChannelWithRetry(
    peerId: string,
    hints: string[] = [],
    neutralPeerId: string = peerId,
  ): Promise<NetworkChannel> {
    const retryOptions: Parameters<typeof retryWithBackoff>[1] = {
      maxAttempts: this.#maxRetryAttempts,
      jitter: true,
      shouldRetry: isRetryableNetworkError,
      onRetry: ({ attempt, maxAttempts, delayMs }) => {
        this.#logger.log(
          `retrying connection to ${peerId} in ${delayMs}ms (next attempt ${attempt}/${maxAttempts || '∞'})`,
        );
      },
      signal: this.#signal,
    };
    return retryWithBackoff(
      async () => this.openChannelOnce(peerId, hints, neutralPeerId),
      retryOptions,
    );
  }

  /**
   * Ensure only one dial attempt per peer at a time.
   *
   * @param peerId - The neutral peer ID to dial. Converted to the libp2p id for
   *   multiaddr construction; the returned channel keeps the neutral id.
   * @param hints - The hints to dial.
   * @param withRetry - Whether to retry the dial.
   * @returns The channel.
   */
  async dial(
    peerId: string,
    hints: string[],
    withRetry: boolean,
  ): Promise<NetworkChannel> {
    // #inflightDials is keyed by the neutral id (what the transport layer and
    // closeConnection know); convert to the libp2p id only for the dial itself.
    const libp2pPeerId = this.#toLibp2pPeerId(peerId);
    let promise = this.#inflightDials.get(peerId);
    if (!promise) {
      promise = (
        withRetry
          ? this.openChannelWithRetry(libp2pPeerId, hints, peerId)
          : this.openChannelOnce(libp2pPeerId, hints, peerId)
      ).finally(() => this.#inflightDials.delete(peerId));
      this.#inflightDials.set(peerId, promise);
    }
    return promise;
  }

  /**
   * Close a channel to release network resources.
   *
   * @param channel - The channel to close.
   * @returns A promise that resolves when the channel is closed.
   */
  async closeChannel(channel: NetworkChannel): Promise<void> {
    return channel.close();
  }

  /**
   * Close a stream's underlying resources: attempt a graceful close and, if
   * that fails, force-abort with the original error.
   *
   * @param stream - The libp2p stream to close.
   * @param peerId - The peer ID for logging.
   */
  async #closeStream(stream: Stream, peerId: string): Promise<void> {
    const closeResult = await stream.close().then(
      () => 'closed' as const,
      (error: unknown) => error,
    );

    if (closeResult === 'closed') {
      this.#logger.log(`${peerId}:: closed channel stream`);
      return;
    }

    // Graceful close failed -- force abort with the original error.
    try {
      stream.abort(
        closeResult instanceof Error ? closeResult : new AbortError(),
      );
      this.#logger.log(`${peerId}:: aborted channel stream`);
    } catch (abortProblem) {
      this.#outputError(peerId, 'closing channel stream', abortProblem);
    }
  }

  /**
   * Schedule a relay reconnection if one is not already in progress.
   *
   * @param relayPeerId - The peer ID of the relay to reconnect to.
   */
  #scheduleRelayReconnect(relayPeerId: string): void {
    if (
      this.#stopped ||
      this.#pendingRelayReconnects.has(relayPeerId) ||
      this.#signal.aborted
    ) {
      return;
    }
    this.#reconnectRelay(relayPeerId, 0);
  }

  /**
   * Attempt to reconnect to a relay with exponential backoff.
   *
   * @param relayPeerId - The peer ID of the relay to reconnect to.
   * @param attempt - The current attempt number (0-indexed).
   */
  #reconnectRelay(relayPeerId: string, attempt: number): void {
    if (this.#stopped || this.#signal.aborted) {
      this.#pendingRelayReconnects.delete(relayPeerId);
      return;
    }

    if (attempt >= RELAY_RECONNECT_MAX_ATTEMPTS) {
      this.#logger.error(
        `relay ${relayPeerId} reconnect exhausted after ${RELAY_RECONNECT_MAX_ATTEMPTS} attempts`,
      );
      this.#pendingRelayReconnects.delete(relayPeerId);
      return;
    }

    const delay = calculateReconnectionBackoff(attempt + 1, {
      baseDelayMs: RELAY_RECONNECT_BASE_DELAY_MS,
      maxDelayMs: RELAY_RECONNECT_MAX_DELAY_MS,
    });

    const timer = setTimeout(() => {
      (async () => {
        if (this.#stopped || this.#signal.aborted || !this.#libp2p) {
          this.#pendingRelayReconnects.delete(relayPeerId);
          return;
        }

        const relayAddr = this.#relayMultiaddrs.get(relayPeerId);
        if (!relayAddr) {
          this.#logger.warn(
            `relay ${relayPeerId} has no known address, cannot reconnect`,
          );
          this.#pendingRelayReconnects.delete(relayPeerId);
          return;
        }

        this.#logger.log(
          `attempting relay reconnect to ${relayPeerId} (attempt ${attempt + 1}/${RELAY_RECONNECT_MAX_ATTEMPTS})`,
        );

        try {
          await this.#libp2p.dial(multiaddr(relayAddr));
          this.#logger.log(`relay ${relayPeerId} reconnected`);
          this.#pendingRelayReconnects.delete(relayPeerId);
        } catch (error) {
          this.#logger.error(`relay ${relayPeerId} reconnect failed:`, error);
          this.#reconnectRelay(relayPeerId, attempt + 1);
        }
      })().catch((error) => {
        this.#logger.error('reconnection failed unexpectedly:', error);
        this.#pendingRelayReconnects.delete(relayPeerId);
      });
    }, delay);

    this.#pendingRelayReconnects.set(relayPeerId, timer);
  }

  /**
   * Output an error message.
   *
   * @param peerId - The peer ID to output an error message for.
   * @param task - The task to output an error message for.
   * @param problem - The problem to output an error message for.
   */
  #outputError(peerId: string, task: string, problem: unknown): void {
    if (problem) {
      const realProblem: Error = problem as Error;
      this.#logger.log(`${peerId}:: error ${task}: ${realProblem}`);
    } else {
      this.#logger.log(`${peerId}:: error ${task}`);
    }
  }

  /**
   * Stop libp2p and clean up.
   */
  async stop(): Promise<void> {
    this.#stopped = true;
    for (const timer of this.#pendingRelayReconnects.values()) {
      clearTimeout(timer);
    }
    this.#pendingRelayReconnects.clear();
    this.#inflightDials.clear();
    if (this.#libp2p) {
      try {
        // Add a timeout to prevent hanging if libp2p.stop() doesn't complete
        const STOP_TIMEOUT_MS = 2000;
        let timeoutId: ReturnType<typeof setTimeout>;
        await Promise.race([
          this.#libp2p.stop(),
          new Promise<void>((_resolve, reject) => {
            timeoutId = setTimeout(
              () => reject(new Error('libp2p.stop() timed out')),
              STOP_TIMEOUT_MS,
            );
          }),
        ]).finally(() => clearTimeout(timeoutId));
      } catch (error) {
        this.#logger.error('libp2p.stop() failed or timed out:', error);
        // Continue anyway - we'll clear the reference
      }
      this.#libp2p = undefined as unknown as Libp2p;
      // Clear any reconnects scheduled by connection:close events during
      // libp2p.stop() teardown.
      for (const timer of this.#pendingRelayReconnects.values()) {
        clearTimeout(timer);
      }
      this.#pendingRelayReconnects.clear();
    }
  }
}
harden(ConnectionFactory);
