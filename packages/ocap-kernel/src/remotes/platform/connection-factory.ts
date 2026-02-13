import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { bootstrap } from '@libp2p/bootstrap';
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2';
import { generateKeyPairFromSeed } from '@libp2p/crypto/keys';
import { identify } from '@libp2p/identify';
import { MuxerClosedError } from '@libp2p/interface';
import type { PrivateKey, Libp2p } from '@libp2p/interface';
import { ping } from '@libp2p/ping';
import { webRTC } from '@libp2p/webrtc';
import { webSockets } from '@libp2p/websockets';
import { webTransport } from '@libp2p/webtransport';
import { AbortError, isRetryableNetworkError } from '@metamask/kernel-errors';
import { fromHex, retryWithBackoff } from '@metamask/kernel-utils';
import { Logger } from '@metamask/logger';
import { multiaddr } from '@multiformats/multiaddr';
import { byteStream } from 'it-byte-stream';
import { createLibp2p } from 'libp2p';

import type {
  Channel,
  ConnectionFactoryOptions,
  DirectTransport,
  InboundConnectionHandler,
} from '../types.ts';

/**
 * Connection factory for libp2p network operations.
 * Handles libp2p initialization, dialing, and connection management.
 */
export class ConnectionFactory {
  #libp2p?: Libp2p;

  readonly #inflightDials = new Map<string, Promise<Channel>>();

  readonly #logger: Logger;

  readonly #signal: AbortSignal;

  readonly #knownRelays: string[];

  readonly #keySeed: string;

  readonly #maxRetryAttempts: number;

  readonly #directTransports: DirectTransport[];

  #inboundHandler?: InboundConnectionHandler;

  /**
   * Constructor for the ConnectionFactory.
   *
   * @param options - The options for the ConnectionFactory.
   * @param options.keySeed - The key seed to use for the libp2p node.
   * @param options.knownRelays - The known relays to use for the libp2p node.
   * @param options.logger - The logger to use for the libp2p node.
   * @param options.signal - The signal to use for the libp2p node.
   * @param options.maxRetryAttempts - Maximum number of reconnection attempts. 0 = infinite (default).
   * @param options.directTransports - Optional direct transports (e.g. QUIC, TCP) with listen addresses.
   */
  // eslint-disable-next-line no-restricted-syntax
  private constructor(options: ConnectionFactoryOptions) {
    this.#keySeed = options.keySeed;
    this.#knownRelays = options.knownRelays;
    this.#logger = options.logger;
    this.#signal = options.signal;
    this.#maxRetryAttempts = options.maxRetryAttempts ?? 0;
    this.#directTransports = options.directTransports ?? [];
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
   * @param options.directTransports - Optional direct transports (e.g. QUIC, TCP) with listen addresses.
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
        // Allow private addresses for local testing
        denyDialMultiaddr: async () => false,
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
    await this.#libp2p.handle('whatever', ({ connection, stream }) => {
      const msgStream = byteStream(stream);
      const remotePeerId = connection.remotePeer.toString();
      this.#logger.log(`inbound connection from peerId:${remotePeerId}`);

      const channel: Channel = {
        msgStream,
        peerId: remotePeerId,
      };

      this.#inboundHandler?.(channel);
    });

    // Start libp2p
    this.#logger.log(
      `Starting libp2p node with peerId: ${this.#libp2p.peerId.toString()}`,
    );
    this.#logger.log(`Connecting to relays: ${this.#knownRelays.join(', ')}`);

    this.#libp2p.addEventListener('self:peer:update', (evt) => {
      this.#logger.log(`Peer update: ${JSON.stringify(evt.detail)}`);
    });

    await this.#libp2p.start();
  }

  /**
   * Set the handler for inbound connections.
   *
   * @param handler - The handler for inbound connections.
   */
  onInboundConnection(handler: InboundConnectionHandler): void {
    this.#inboundHandler = handler;
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
   * Get candidate address strings for dialing a peer.
   *
   * @param peerId - The peer ID to get candidate address strings for.
   * @param hints - The hints to get candidate address strings for.
   * @returns The candidate address strings.
   */
  candidateAddressStrings(peerId: string, hints: string[]): string[] {
    const directAddresses: string[] = [];
    const relayHints: string[] = [];

    for (const hint of hints) {
      try {
        if (multiaddr(hint).getPeerId() === peerId) {
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
   * @param peerId - The peer ID to open a channel for.
   * @param hints - The hints to open a channel for.
   * @returns The channel.
   */
  async openChannelOnce(
    peerId: string,
    hints: string[] = [],
  ): Promise<Channel> {
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
        const msgStream = byteStream(stream);
        const channel: Channel = { msgStream, peerId };
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
   * @param peerId - The peer ID to open a channel for.
   * @param hints - The hints to open a channel for.
   * @returns The channel.
   */
  async openChannelWithRetry(
    peerId: string,
    hints: string[] = [],
  ): Promise<Channel> {
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
      async () => this.openChannelOnce(peerId, hints),
      retryOptions,
    );
  }

  /**
   * Ensure only one dial attempt per peer at a time.
   *
   * @param peerId - The peer ID to dial.
   * @param hints - The hints to dial.
   * @param withRetry - Whether to retry the dial.
   * @returns The channel.
   */
  async dialIdempotent(
    peerId: string,
    hints: string[],
    withRetry: boolean,
  ): Promise<Channel> {
    let promise = this.#inflightDials.get(peerId);
    if (!promise) {
      promise = (
        withRetry
          ? this.openChannelWithRetry(peerId, hints)
          : this.openChannelOnce(peerId, hints)
      ).finally(() => this.#inflightDials.delete(peerId));
      this.#inflightDials.set(peerId, promise);
    }
    return promise;
  }

  /**
   * Close a channel's underlying stream to release network resources.
   *
   * @param channel - The channel to close.
   * @param peerId - The peer ID for logging.
   */
  async closeChannel(channel: Channel, peerId: string): Promise<void> {
    try {
      // ByteStream.unwrap() returns the underlying libp2p stream.
      const maybeWrapper = channel.msgStream as unknown as {
        unwrap?: () => unknown;
      };
      const underlying =
        typeof maybeWrapper.unwrap === 'function'
          ? maybeWrapper.unwrap()
          : undefined;

      const closable = underlying as
        | { close?: () => Promise<void> }
        | undefined;
      if (closable?.close) {
        await closable.close();
        this.#logger.log(`${peerId}:: closed channel stream`);
        return;
      }

      const abortable = underlying as
        | { abort?: (error?: Error) => void }
        | undefined;
      if (abortable?.abort) {
        abortable.abort(new AbortError());
        this.#logger.log(`${peerId}:: aborted channel stream`);
        return;
      }

      // If we cannot explicitly close/abort, log and rely on natural closure.
      this.#logger.log(
        `${peerId}:: channel stream lacks close/abort, relying on natural closure`,
      );
    } catch (problem) {
      this.#outputError(peerId, 'closing channel stream', problem);
    }
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
    }
  }
}
